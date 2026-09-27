import { ErrorNegocio } from '../../shared/errorNegocio'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, mkdir, readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { Client } from 'pg'
import type { ConexionLocal } from '../../shared/persistencia'

const ejecutar = promisify(execFile)
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
    const bin = this.opciones.binarios
    const versionMotor = (
      await ejecutar(join(bin, 'postgres.exe'), ['--version'], { windowsHide: true })
    ).stdout.match(/PostgreSQL\) (\d+)/)?.[1]
    if (await existe(join(data, 'PG_VERSION'))) {
      if ((await readFile(join(data, 'PG_VERSION'), 'utf8')).trim() !== versionMotor)
        throw new ErrorNegocio(
          'La versión del motor no coincide con los datos existentes. Se necesita una actualización técnica; no se modificaron los datos.'
        )
    } else {
      const provisional = this.ruta('data-inicializando'),
        pw = this.ruta('inicio.pw')
      if (await existe(provisional))
        throw new ErrorNegocio(
          'La preparación del almacenamiento quedó interrumpida. Contacta con soporte; los archivos existentes se conservaron.'
        )
      try {
        await writeFile(pw, c.passwordAdministrador + '\n', { mode: 0o600 })
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
        await writeFile(
          join(provisional, 'ruizcacao.conf'),
          `listen_addresses = '127.0.0.1'\nport = ${c.conexion.port}\ntimezone = 'America/Guayaquil'\npassword_encryption = 'scram-sha-256'\n`,
          { mode: 0o600 }
        )
        await writeFile(join(provisional, 'postgresql.auto.conf'), "include = 'ruizcacao.conf'\n", {
          mode: 0o600
        })
        await rename(provisional, data)
      } finally {
        await unlink(pw).catch(() => {})
      }
    }
    let conectado = await this.administrador(async () => true).catch(() => false)
    if (!conectado) {
      try {
        // En Windows no arrancar postgres.exe como proceso detached: Node crea una consola
        // independiente para procesos detached. pg_ctl espera el arranque del servidor y,
        // junto con windowsHide, mantiene PostgreSQL completamente en segundo plano.
        await ejecutar(
          join(bin, 'pg_ctl.exe'),
          [
            '-D',
            data,
            '-l',
            this.ruta('postgresql.log'),
            '-w',
            '-t',
            '30',
            'start'
          ],
          { windowsHide: true, timeout: 35000 }
        )
      } catch {
        // pg_ctl puede devolver error aunque el servidor haya alcanzado a iniciar;
        // comprobamos la conexión antes de mostrar el mensaje al usuario.
      }
      conectado = await this.administrador(async () => true).catch(() => false)
      if (!conectado)
        throw new ErrorNegocio(
          'El almacenamiento local no pudo iniciarse. Contacta con soporte; tus datos se conservaron.'
        )
    }
    this.iniciado = true
    await this.administrador(async (db) => {
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
    return { ...c.conexion }
  }
  async detener(): Promise<void> {
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
      ['-D', this.ruta('data'), '-m', 'fast', '-w', '-t', '20', 'stop'],
      { windowsHide: true, timeout: 25000 }
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
