import { ErrorNegocio } from '../../shared/errorNegocio'
import { Respaldos } from './respaldos'
import { configurarLogs, traducirError } from './errores'
import { app, safeStorage } from 'electron'
import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { BaseLocal } from './base'
import { PostgresLocal, localizarPostgres } from './postgres-local'
import type { ConexionLocal, EstadoAcceso } from '../../shared/persistencia'
let base: BaseLocal | null = null
let local: PostgresLocal | null = null
let errorInicio = ''
export function obtenerBase(): BaseLocal {
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
    errorInicio = ''
  } catch (error) {
    await candidata.desconectar().catch(() => {})
    throw error
  }
}
export async function iniciarPersistencia(): Promise<void> {
  if (base) return
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
}
export async function estadoAcceso(): Promise<EstadoAcceso> {
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
  if (base) {
    await base.cerrar()
    base = null
  }
  if (local) await local.detener()
}
