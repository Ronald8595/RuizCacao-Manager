import { ErrorNegocio } from '../../shared/errorNegocio'
import { marcaPerfil } from '../perfil-arranque'
import { Respaldos } from './respaldos'
import { configurarLogs, traducirError } from './errores'
import { app, safeStorage } from 'electron'
import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { BaseLocal } from './base'
import { PostgresLocal, localizarPostgres } from './postgres-local'
import type { ConexionLocal, EstadoAcceso } from '../../shared/persistencia'
import { operacionesRespaldos } from './operacion-respaldo'
import type { RestaurarRespaldoSeguro } from './restore-caso'
let base: BaseLocal | null = null
let local: PostgresLocal | null = null
let errorInicio = ''
let mantenimiento = false
let configActual: ConexionLocal | undefined
export function obtenerBase(): BaseLocal {
  if (mantenimiento) throw new ErrorNegocio('Se está cargando un respaldo. Espera a que termine.')
  if (!base) throw new ErrorNegocio('El almacenamiento no está disponible. Reintenta el acceso.')
  return base
}
async function conectar(config: ConexionLocal): Promise<void> {
  const binarios = await localizarPostgres(process.resourcesPath)
  let publica: string | undefined
  const rutaPublica = app.isPackaged
    ? join(process.resourcesPath, 'security', 'recovery-public.pem')
    : join(app.getAppPath(), 'resources', 'security', 'recovery-public.pem')
  try {
    publica = await readFile(rutaPublica, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  const candidata = new BaseLocal(config, {
    publica,
    respaldos: new Respaldos(config, binarios, join(app.getPath('userData'), 'backups'))
  })
  try {
    await candidata.iniciar()
    base = candidata
    configActual = config
    errorInicio = ''
  } catch (error) {
    await candidata.desconectar().catch(() => {})
    throw error
  }
}
export async function iniciarPersistencia(): Promise<void> {
  if (mantenimiento) return
  if (base) return
  marcaPerfil('persistencia-start')
  configurarLogs(join(app.getPath('userData'), 'logs'))
  try {
    const restauracionPendiente = await access(
      join(app.getPath('userData'), 'restauracion-pendiente')
    ).then(
      () => true,
      () => false
    )
    if (restauracionPendiente)
      throw new ErrorNegocio(
        'Una restauración no terminó. Contacta con soporte antes de continuar.'
      )
    if (!safeStorage.isEncryptionAvailable())
      throw new ErrorNegocio('Windows no permite proteger el almacenamiento local.')
    let anterior: Buffer | undefined
    try {
      anterior = await readFile(join(app.getPath('userData'), 'postgres.enc'))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    // Conservar conexiones ya configuradas: nunca reemplazar una base existente por otra vacía.
    if (anterior) await conectar(JSON.parse(safeStorage.decryptString(anterior)))
    else {
      local ??= new PostgresLocal({
        carpeta: join(app.getPath('userData'), 'postgres'),
        binarios: await localizarPostgres(process.resourcesPath),
        cifrar: (texto) => safeStorage.encryptString(texto),
        descifrar: (buffer) => safeStorage.decryptString(buffer)
      })
      await conectar(await local.iniciar())
    }
  } catch (error) {
    errorInicio = traducirError(error, { modulo: 'acceso', operacion: 'iniciar' })
  }
  marcaPerfil('persistencia-end', { ok: !!base })
}
export async function estadoAcceso(): Promise<EstadoAcceso> {
  if (mantenimiento)
    return {
      configurada: false,
      administradorExiste: true,
      autenticado: false,
      error: 'La carga necesita finalizar o recuperarse antes de continuar.'
    }
  if (!base) await iniciarPersistencia()
  if (!base)
    return {
      configurada: false,
      administradorExiste: false,
      autenticado: false,
      error: errorInicio
    }
  try {
    return {
      configurada: true,
      administradorExiste: await base.existeAdministrador(),
      autenticado: base.autenticado()
    }
  } catch {
    return {
      configurada: true,
      administradorExiste: true,
      autenticado: false,
      error: 'El almacenamiento no responde. Reintenta o contacta con soporte.'
    }
  }
}
export async function cerrarPersistencia(): Promise<void> {
  operacionesRespaldos.cancelarAlCerrar()
  await operacionesRespaldos.esperar()
  if (base) {
    await base.cerrar()
    base = null
  }
  if (local) await local.detener()
}
// Composición interna de Main; NO hay canal IPC ni entrada Renderer en esta etapa.
export async function crearRestauradorInterno(): Promise<RestaurarRespaldoSeguro> {
  if (!local || !base || !configActual)
    throw new ErrorNegocio(
      'Modo de PostgreSQL externo no soporta restauración automática de producto en esta versión.'
    )
  const [
    { WorkspaceRestorePostgres },
    { DestinoRestorePostgres },
    { PromocionPostgres },
    { RestaurarRespaldoSeguro }
  ] = await Promise.all([
    import('./restore-workspace'),
    import('./restore-destino'),
    import('./restore-promocion'),
    import('./restore-caso')
  ])
  const motor = local,
    config = configActual,
    binarios = await localizarPostgres(process.resourcesPath),
    journal = motor.journalRestauracion()
  const destino = new DestinoRestorePostgres(
    motor,
    binarios,
    join(app.getPath('userData'), 'backups'),
    () => {
      if (!base) throw new ErrorNegocio('El almacenamiento no está disponible.')
      return base.pool
    }
  )
  const caso = new RestaurarRespaldoSeguro(
    new WorkspaceRestorePostgres({
      raiz: join(app.getPath('userData'), 'restore-workspaces'),
      binarios,
      cifrar: (s) => safeStorage.encryptString(s),
      descifrar: (b) => safeStorage.decryptString(b)
    }),
    destino,
    journal,
    new PromocionPostgres((fn) => motor.conAdministracionRestauracion(fn), journal),
    {
      entrar: async () => {
        mantenimiento = true
        if (base) await base.transaccion(async () => {}, true)
      },
      cerrarPool: async () => {
        if (base) {
          await base.desconectarParaRestauracion()
          base = null
        }
      },
      reconectar: async () => {
        if (!base) await conectar(config)
      },
      salir: (seguro) => {
        mantenimiento = !seguro
      }
    },
    (error) => {
      traducirError(error, { modulo: 'respaldos', operacion: 'recuperar_carga' })
    }
  )
  const ejecutar = caso.ejecutar.bind(caso)
  caso.ejecutar = async (...args) => {
    try {
      return await ejecutar(...args)
    } catch (error) {
      const mensaje = traducirError(error, { modulo: 'respaldos', operacion: 'cargar' })
      if (mantenimiento)
        throw new ErrorNegocio(
          'La carga necesita revisión técnica antes de continuar. Las bases se conservaron.'
        )
      if ((error as Error).name === 'AbortError') throw error
      throw new ErrorNegocio(mensaje)
    }
  }
  return caso
}
