import { ErrorNegocio } from '../../shared/errorNegocio'
import { marcaPerfil } from '../perfil-arranque'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import {
  access,
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  readdir,
  open,
  realpath
} from 'node:fs/promises'
import { JournalRestauracionArchivo } from './restore-journal'
import { recuperarPromocion } from './restore-promocion'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { Client } from 'pg'
import type { ConexionLocal } from '../../shared/persistencia'
import { traducirError } from './errores'

const ejecutar = promisify(execFile)
export function faltaRuntimeWindows(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code
  return typeof code === 'number' && Number.isSafeInteger(code) && code >>> 0 === 0xc0000135
}
function falloMotor(error: unknown, operacion: string): ErrorNegocio {
  // Se excluyen argumentos, contraseñas, rutas, message y stdout/stderr del log.
  traducirError(error, { modulo: 'postgres', operacion })
  return new ErrorNegocio(
    faltaRuntimeWindows(error)
      ? 'Falta un componente de Microsoft necesario para iniciar RuizCacao Manager. Vuelve a ejecutar el instalador para completar la instalación. Si Windows solicita reiniciar, reinicia el equipo. Tus datos se conservaron.'
      : 'No se pudo preparar el almacenamiento local. Vuelve a ejecutar el instalador o contacta con soporte. Los archivos existentes se conservaron.'
  )
}
const existe = async (ruta: string): Promise<boolean> => {
  try {
    await access(ruta)
    return true
  } catch {
    return false
  }
}
interface Credenciales {
  conexion: ConexionLocal
  passwordAdministrador: string
}
interface Opciones {
  carpeta: string
  binarios: string
  cifrar: (texto: string) => Buffer
  descifrar: (buffer: Buffer) => string
}

export async function localizarPostgres(resourcesPath: string): Promise<string> {
  const empaquetado = join(resourcesPath, 'postgresql', 'bin')
  if (await existe(join(empaquetado, 'postgres.exe'))) return empaquetado
  // En desarrollo se aprovecha el motor ya instalado; nunca su servicio ni sus bases.
  const raiz = join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL')
  for (const version of (await readdir(raiz).catch(() => []))
    .filter((v) => /^\d+$/.test(v))
    .sort((a, b) => Number(b) - Number(a))) {
    if (Number(version) < 14) continue
    const bin = join(raiz, version, 'bin')
    if (await existe(join(bin, 'postgres.exe'))) return bin
  }
  throw new ErrorNegocio(
    'El instalador no incluye el motor local de datos. Contacta con soporte para completar la instalación.'
  )
}

/** Instancia privada de la aplicación, limitada a loopback y autenticada con SCRAM.
 * Los binarios viajan en el instalador; las bases quedan fuera de los binarios.
 * No instala ni modifica servicios Windows, pgAdmin o clusters preexistentes. */
export class PostgresLocal {
  private credenciales?: Credenciales
  private iniciado = false
  constructor(private readonly opciones: Opciones) {}
  private ruta(nombre: string): string {
    return join(this.opciones.carpeta, nombre)
  }
  private async guardar(credenciales: Credenciales): Promise<void> {
    const destino = this.ruta('conexion.enc')
    await writeFile(destino + '.tmp', this.opciones.cifrar(JSON.stringify(credenciales)), {
      mode: 0o600
    })
    await rename(destino + '.tmp', destino)
  }
  private async puertoDisponible(): Promise<number> {
    for (let puerto = 55432; puerto <= 55442; puerto++) {
      const libre = await new Promise<boolean>((resolve) => {
        const servidor = createServer()
        servidor.once('error', () => resolve(false))
        servidor.listen(puerto, '127.0.0.1', () => servidor.close(() => resolve(true)))
      })
      if (libre) return puerto
    }
    throw new ErrorNegocio('No hay un puerto local disponible para iniciar el almacenamiento.')
  }
  private async administrador<T>(fn: (db: Client) => Promise<T>): Promise<T> {
    const c = this.credenciales!
    const db = new Client({
      ...c.conexion,
      user: 'ruizcacao_bootstrap',
      password: c.passwordAdministrador,
      database: 'postgres',
      connectionTimeoutMillis: 1000
    })
    try {
      await db.connect()
      return await fn(db)
    } finally {
      await db.end().catch(() => {})
    }
  }
  async iniciar(): Promise<ConexionLocal> {
    marcaPerfil('postgres-local-iniciar-start')
    marcaPerfil('postgres-verificacion-start')
    const bin = this.opciones.binarios
    let versionMotor: string | undefined
    // Antes de generar credenciales o crear el directorio provisional: un motor
    // presente puede no ser ejecutable en Windows si falta el runtime de Microsoft.
    for (const nombre of ['postgres', 'initdb', 'pg_ctl', 'psql']) {
      try {
        const { stdout } = await ejecutar(join(bin, nombre + '.exe'), ['--version'], {
          windowsHide: true,
          timeout: 10000
        })
        const version = stdout.match(/PostgreSQL\) (\d+)/)?.[1]
        if (!version) throw Object.assign(new Error(), { code: 'VERSION_MOTOR_INVALIDA' })
        if (nombre === 'postgres') versionMotor = version
        else if (version !== versionMotor)
          throw Object.assign(new Error(), { code: 'VERSION_MOTOR_INCONSISTENTE' })
      } catch (error) {
        throw falloMotor(error, nombre + '_version')
      }
    }
    marcaPerfil('postgres-verificacion-end')
    await mkdir(this.opciones.carpeta, { recursive: true })
    if (process.platform === 'win32') {
      // No heredar accesos de otros usuarios para credenciales y datos financieros.
      const { stdout } = await ejecutar('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
        windowsHide: true
      })
      const sid = stdout.match(/S-1-5-[\d-]+/)?.[0]
      if (!sid) throw new ErrorNegocio('No se pudo proteger la carpeta local de datos.')
      await ejecutar(
        'icacls.exe',
        [
          this.opciones.carpeta,
          '/inheritance:r',
          '/grant:r',
          `*${sid}:(OI)(CI)F`,
          '*S-1-5-18:(OI)(CI)F'
        ],
        { windowsHide: true }
      )
    }
    if (await existe(this.ruta('conexion.enc')))
      this.credenciales = JSON.parse(
        this.opciones.descifrar(await readFile(this.ruta('conexion.enc')))
      )
    else {
      if (await existe(this.ruta('data')))
        throw new ErrorNegocio(
          'Existe almacenamiento sin su clave de conexión. No se sobrescribirá; contacta con soporte.'
        )
      this.credenciales = {
        conexion: {
          host: '127.0.0.1',
          port: await this.puertoDisponible(),
          database: 'ruizcacao_manager',
          user: 'ruizcacao_app',
          password: randomBytes(32).toString('hex')
        },
        passwordAdministrador: randomBytes(32).toString('hex')
      }
      await this.guardar(this.credenciales)
    }
    const c = this.credenciales!,
      data = this.ruta('data')
    if (await existe(join(data, 'PG_VERSION'))) {
      if ((await readFile(join(data, 'PG_VERSION'), 'utf8')).trim() !== versionMotor)
        throw new ErrorNegocio(
          'La versión del motor no coincide con los datos existentes. Se necesita una actualización técnica; no se modificaron los datos.'
        )
    } else {
      if (await existe(data))
        throw new ErrorNegocio(
          'El almacenamiento existente necesita revisión técnica. No se sobrescribirá; contacta con soporte.'
        )
      const provisional = this.ruta('data-inicializando'),
        pw = this.ruta('inicio.pw')
      if (await existe(provisional))
        throw new ErrorNegocio(
          'La preparación del almacenamiento quedó interrumpida. Contacta con soporte; los archivos existentes se conservaron.'
        )
      try {
        await writeFile(pw, c.passwordAdministrador + '\n', { mode: 0o600 })
        marcaPerfil('initdb-start')
        await ejecutar(
          join(bin, 'initdb.exe'),
          [
            '-D',
            provisional,
            '-U',
            'ruizcacao_bootstrap',
            '--pwfile=' + pw,
            '--auth=scram-sha-256',
            '--encoding=UTF8',
            '--locale=C'
          ],
          { windowsHide: true, timeout: 60000 }
        )
        marcaPerfil('initdb-end')
        await writeFile(
          join(provisional, 'ruizcacao.conf'),
          `listen_addresses = '127.0.0.1'\nport = ${c.conexion.port}\ntimezone = 'America/Guayaquil'\npassword_encryption = 'scram-sha-256'\n`,
          { mode: 0o600 }
        )
        await writeFile(join(provisional, 'postgresql.auto.conf'), "include = 'ruizcacao.conf'\n", {
          mode: 0o600
        })
        await rename(provisional, data)
      } catch (error) {
        throw falloMotor(error, 'inicializar_cluster')
      } finally {
        await unlink(pw).catch(() => {})
      }
    }
    marcaPerfil('postgres-conexion-start')
    let conectado = await this.administrador(async () => true).catch(() => false)
    if (!conectado) {
      try {
        // En Windows no arrancar postgres.exe como proceso detached: Node crea una consola
        // independiente para procesos detached. pg_ctl espera el arranque del servidor y,
        // junto con windowsHide, mantiene PostgreSQL completamente en segundo plano.
        // pg_ctl crea CMD en Windows, que hereda sus pipes y vive tanto como
        // postgres. Archivos en lugar de pipes permiten recibir close al salir
        // pg_ctl, conservando stderr. Separar este log del -l evita un bloqueo
        // de apertura de postgresql.log por la redirección interna de CMD.
        const salida = await open(this.ruta('pg_ctl.log'), 'a', 0o600)
        try {
          await new Promise<void>((resolve, reject) => {
            const child = spawn(
              join(bin, 'pg_ctl.exe'),
              ['-D', data, '-l', this.ruta('postgresql.log'), '-w', '-t', '30', 'start'],
              {
                windowsHide: true,
                shell: false,
                detached: false,
                stdio: ['ignore', salida.fd, salida.fd],
                timeout: 35000,
                killSignal: 'SIGTERM'
              }
            )
            child.once('error', reject)
            child.once('close', (code, signal) => {
              if (code === 0 && !signal) resolve()
              else reject(Object.assign(new Error('Fallo al iniciar pg_ctl'), { code, signal }))
            })
          })
          marcaPerfil('pg_ctl-resolved')
        } finally {
          await salida.close()
        }
      } catch (error) {
        traducirError(error, { modulo: 'postgres', operacion: 'arrancar_cluster' })
        // Un timeout puede dejar el servidor privado arrancando. El mismo
        // cierre por data_directory evita dejarlo huérfano; no ocultar el fallo
        // de pg_ctl aunque una conexión posterior llegara a funcionar.
        // En la prueba de recuperación bloqueada fast necesitó ~34 s después
        // de la señal. Solo este cierre excepcional admite 60 s; el normal 20 s.
        this.iniciado = true
        await this.detenerConEspera(60).catch((fallo) =>
          traducirError(fallo, { modulo: 'postgres', operacion: 'cerrar_arranque_fallido' })
        )
        throw new ErrorNegocio(
          'El almacenamiento local no pudo iniciarse. Contacta con soporte; tus datos se conservaron.'
        )
      }
      conectado = await this.administrador(async () => true).catch(() => false)
      if (!conectado) {
        this.iniciado = true
        await this.detenerConEspera(60).catch((fallo) =>
          traducirError(fallo, { modulo: 'postgres', operacion: 'cerrar_arranque_no_disponible' })
        )
        throw new ErrorNegocio(
          'El almacenamiento local no pudo iniciarse. Contacta con soporte; tus datos se conservaron.'
        )
      }
    }
    this.iniciado = true
    marcaPerfil('postgres-auth-ready')
    await this.administrador(async (db) => {
      const journal = this.journalRestauracion()
      const pendiente = await journal.leer()
      if (pendiente) await recuperarPromocion(db, journal, pendiente)
      // Contraseña generada hexadecimal: nunca se interpola una entrada del usuario.
      if (!/^[0-9a-f]{64}$/.test(c.conexion.password))
        throw new ErrorNegocio('Configuración local inválida.')
      if (!(await db.query("SELECT 1 FROM pg_roles WHERE rolname='ruizcacao_app'")).rowCount)
        await db.query(
          `CREATE ROLE ruizcacao_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${c.conexion.password}'`
        )
      if (!(await db.query("SELECT 1 FROM pg_database WHERE datname='ruizcacao_manager'")).rowCount)
        await db.query('CREATE DATABASE ruizcacao_manager OWNER ruizcacao_app')
      await db.query('REVOKE ALL ON DATABASE ruizcacao_manager FROM PUBLIC')
    })
    marcaPerfil('postgres-ready')
    marcaPerfil('postgres-local-iniciar-end')
    return { ...c.conexion }
  }
  async detener(): Promise<void> {
    await this.detenerConEspera(20)
  }
  journalRestauracion(): JournalRestauracionArchivo {
    return new JournalRestauracionArchivo(this.ruta('restauracion-journal.json'))
  }
  configuracionRestauracion(): ConexionLocal {
    if (!this.credenciales || !this.iniciado)
      throw new ErrorNegocio('El motor local no está preparado.')
    return { ...this.credenciales.conexion }
  }
  async conAdministracionRestauracion<T>(trabajo: (db: Client) => Promise<T>): Promise<T> {
    if (!this.iniciado) throw new ErrorNegocio('El motor local no está preparado.')
    return this.administrador(async (db) => {
      const { leerDirectorioPostgres } = await import('./postgres-ruta')
      const actual = await realpath(await leerDirectorioPostgres(db))
      if (actual.toLowerCase() !== (await realpath(this.ruta('data'))).toLowerCase())
        throw new ErrorNegocio('El almacenamiento no pertenece a esta instalación.')
      return trabajo(db)
    })
  }
  private async detenerConEspera(segundos: number): Promise<void> {
    if (!this.iniciado) return
    try {
      await ejecutar(
        join(this.opciones.binarios, 'pg_ctl.exe'),
        ['-D', this.ruta('data'), 'status'],
        { windowsHide: true }
      )
    } catch (error) {
      if ((error as { code?: number }).code === 3) {
        this.iniciado = false
        return
      }
      throw error
    }
    await ejecutar(
      join(this.opciones.binarios, 'pg_ctl.exe'),
      ['-D', this.ruta('data'), '-m', 'fast', '-w', '-t', String(segundos), 'stop'],
      { windowsHide: true, timeout: (segundos + 5) * 1000 }
    )
    this.iniciado = false
  }
  async exportarPgAdmin(): Promise<string> {
    if (!this.credenciales) throw new ErrorNegocio('Inicia primero el almacenamiento.')
    return exportarConexionPgAdmin(this.credenciales.conexion, this.ruta('administracion'))
  }
}

export async function exportarConexionPgAdmin(c: ConexionLocal, carpeta: string): Promise<string> {
  await mkdir(carpeta, { recursive: true })
  if (process.platform === 'win32') {
    const { stdout } = await ejecutar('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
      windowsHide: true
    })
    const sid = stdout.match(/S-1-5-[\d-]+/)?.[0]
    if (!sid) throw new ErrorNegocio('No se pudo proteger la conexión de administración.')
    await ejecutar(
      'icacls.exe',
      [carpeta, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'],
      { windowsHide: true }
    )
  }
  const passfile = join(carpeta, 'pgpass.conf')
  const escapar = (valor: string | number): string =>
    String(valor).replaceAll('\\', '\\\\').replaceAll(':', '\\:')
  await writeFile(
    passfile,
    [c.host, c.port, c.database, c.user, c.password].map(escapar).join(':') + '\n',
    { mode: 0o600 }
  )
  await writeFile(
    join(carpeta, 'servidor-pgadmin.json'),
    JSON.stringify(
      {
        Servers: {
          '1': {
            Name: 'RuizCacao Manager (local)',
            Group: 'Grupo Ruiz',
            Host: c.host,
            Port: c.port,
            MaintenanceDB: c.database,
            Username: c.user,
            SSLMode: 'prefer',
            PassFile: passfile,
            ConnectionParameters: { passfile }
          }
        }
      },
      null,
      2
    )
  )
  return carpeta
}
