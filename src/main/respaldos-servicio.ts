import { ErrorDiagnosticoRespaldo, diagnosticarRespaldo } from './database/respaldo-diagnostico'
import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { ContextoOperacion } from './database/operacion-respaldo'
import type { RestorePreparado } from './database/restore-workspace'
import type {
  FaseRespaldo,
  ProgresoRespaldo,
  ResumenRespaldo,
  ResultadoRespaldo,
  SeleccionRespaldo,
  TipoRespaldo
} from '../shared/respaldos'

export class ErrorRespaldo extends Error {
  constructor(readonly codigo: string) {
    super(codigo)
  }
}
export const mensajesRespaldo: Record<string, string> = {
  permiso: 'No tienes permisos para realizar esta acción.',
  ocupado: 'Ya existe una operación de respaldo en curso.',
  solicitud: 'La solicitud no es válida. Selecciona el respaldo nuevamente.',
  password: 'La contraseña no es correcta. Revisa e intenta nuevamente.',
  futuro:
    'Este respaldo fue creado con una versión más reciente de RuizCacao Manager. Actualiza la aplicación antes de cargarlo.',
  invalido: 'El archivo seleccionado no corresponde a un respaldo válido de RuizCacao Manager.',
  danado: 'El respaldo está dañado o incompleto y no puede cargarse.',
  externo:
    'La carga automática de respaldos no está disponible en esta configuración de base de datos.',
  espacio: 'No hay suficiente espacio disponible para cargar este respaldo de forma segura.',
  bloqueado:
    'La carga necesita revisión técnica antes de continuar. La información se conservó para recuperarla.',
  autenticacion: 'No se pudo verificar la contraseña. Revisa el acceso e intenta nuevamente.',
  general: 'No se pudo completar la operación. Intenta nuevamente o contacta con soporte.'
}
export function errorRespaldo(error: unknown): { codigo: string; error: string } {
  let codigo = error instanceof ErrorRespaldo ? error.codigo : 'general'
  const interno = (error as { codigoRespaldo?: unknown } | null)?.codigoRespaldo
  if (typeof interno === 'string' && Object.hasOwn(mensajesRespaldo, interno)) codigo = interno
  const m = error instanceof Error ? error.message : ''
  if (codigo === 'general') {
    if (/más reciente|format.*vers|formato.*vers|versión.*formato/i.test(m)) codigo = 'futuro'
    else if (/externo|modo privado/i.test(m)) codigo = 'externo'
    else if (/espacio|ENOSPC/i.test(m)) codigo = 'espacio'
    else if (/revisión técnica|Acceso bloqueado/i.test(m)) codigo = 'bloqueado'
    else if (/producto|product_id|no corresponde|no es un respaldo|manifiesto.*inválido/i.test(m))
      codigo = 'invalido'
    else if (
      /integridad|CRC|hash|ZIP|contenedor|truncad|incompleto|PGDMP|manifest|central directory|signature|unexpected.*end|JSON/i.test(
        m
      )
    )
      codigo = 'danado'
  }
  return { codigo, error: mensajesRespaldo[codigo] ?? mensajesRespaldo.general }
}
export interface PuertosRespaldos {
  autorizar(tipo: TipoRespaldo): string | Promise<string>
  credencial(password: string): Promise<void>
  seleccionar(tipo: TipoRespaldo): Promise<string | null>
  tamano(ruta: string): Promise<number>
  preparar(ruta: string, ctx: ContextoOperacion): Promise<RestorePreparado>
  generar(ruta: string, ctx: ContextoOperacion): Promise<string>
  cargar(p: RestorePreparado, ctx: ContextoOperacion, autorizacion: string): Promise<void>
  bloquearHastaReinicio(): void
  reiniciar(): Promise<void>
  progreso(p: ProgresoRespaldo): void
}
interface Operacion {
  id: string
  usuario: string
  tipo: TipoRespaldo
  ruta: string
  nombre: string
  estado: 'dialogo' | 'seleccionado' | 'trabajando' | 'listo' | 'autorizando' | 'reinicio'
  abort: AbortController
  cancelable: boolean
  preparado?: RestorePreparado
  preparacionId?: string
  tarea?: Promise<unknown>
  liberacion?: Promise<void>
  reinicio?: Promise<void>
  ultimo?: string
}
/** Una sola intención UI. Las rutas y los recursos preparados nunca salen de Main. */
export class ServicioRespaldos {
  private operacion?: Operacion
  private cerrado = false
  constructor(private readonly puertos: PuertosRespaldos) {}
  private async obtener(id: string, autorizar = true): Promise<Operacion> {
    const o = this.operacion
    if (!o || o.id !== id) throw new ErrorRespaldo('solicitud')
    if (autorizar && (await this.puertos.autorizar(o.tipo)) !== o.usuario)
      throw new ErrorRespaldo('permiso')
    if (this.operacion !== o) throw new ErrorRespaldo('solicitud')
    return o
  }
  private async autorizarInicio(id: string): Promise<Operacion> {
    const o = await this.obtener(id, false)
    try {
      return await this.obtener(id)
    } catch (e) {
      if (o.estado === 'seleccionado' || o.estado === 'listo') await this.liberar(o)
      throw e
    }
  }
  async seleccionar(tipo: TipoRespaldo): Promise<SeleccionRespaldo | null> {
    const usuario = await this.puertos.autorizar(tipo)
    if (this.cerrado || this.operacion) throw new ErrorRespaldo('ocupado')
    const o: Operacion = {
      id: randomUUID(),
      usuario,
      tipo,
      ruta: '',
      nombre: '',
      estado: 'dialogo',
      abort: new AbortController(),
      cancelable: true
    }
    this.operacion = o
    try {
      const ruta = await this.puertos.seleccionar(tipo)
      if (!ruta || this.cerrado || o.abort.signal.aborted) {
        this.operacion = undefined
        return null
      }
      if ((await this.puertos.autorizar(tipo)) !== usuario) throw new ErrorRespaldo('permiso')
      if (!ruta.toLowerCase().endsWith('.back'))
        throw new ErrorDiagnosticoRespaldo('BACKUP_INVALID_EXTENSION', 'seleccion')
      o.ruta = ruta
      o.nombre = basename(ruta)
      o.estado = 'seleccionado'
      return { operacionId: o.id, nombre: o.nombre }
    } catch (e) {
      this.operacion = undefined
      throw e
    }
  }
  private contexto(o: Operacion): ContextoOperacion {
    return {
      signal: o.abort.signal,
      fase: (fase) => {
        if (fase === 'antes_promocion' || fase === 'publicando') o.cancelable = false
        const mapa: Record<string, FaseRespaldo> = {
          exportando: 'exportando',
          hash: 'verificando',
          empaquetando: 'verificando',
          verificando: 'verificando',
          guardando: 'guardando',
          validando_contenedor: 'verificando',
          inspeccionando: 'verificando',
          iniciando_aislamiento: 'datos',
          restaurando_staging: 'datos',
          migrando_staging: 'datos',
          normalizando: 'datos',
          preparando_candidata: 'datos',
          restaurando_candidata: 'datos',
          candidata_validada: 'verificando',
          pre_restauracion: 'seguridad',
          antes_promocion: 'finalizando',
          publicando: 'finalizando',
          resultado: 'resultado'
        }
        const visible = o.cancelable ? (mapa[fase] ?? 'preparando') : 'finalizando'
        // Los exports internos durante restore forman parte de preparar/seguridad.
        const f =
          o.tipo === 'cargar' && ['exportando', 'hash'].includes(fase)
            ? o.ultimo?.startsWith('seguridad')
              ? 'seguridad'
              : 'datos'
            : visible
        const clave = f + ':' + o.cancelable
        if (o.ultimo !== clave) {
          o.ultimo = clave
          this.puertos.progreso({ operacionId: o.id, fase: f, cancelable: o.cancelable })
        }
      }
    }
  }
  private liberar(o: Operacion): Promise<void> {
    o.liberacion ??= Promise.resolve().then(async () => {
      try {
        await o.preparado?.limpiar()
        o.preparado = undefined
      } finally {
        if (this.operacion === o) this.operacion = undefined
      }
    })
    return o.liberacion
  }
  private ejecutar<T>(o: Operacion, trabajo: () => Promise<T>): Promise<T> {
    o.estado = 'trabajando'
    const tarea = trabajo()
    o.tarea = tarea
    return tarea
  }
  async generar(id: string): Promise<ResultadoRespaldo> {
    await this.autorizarInicio(id)
    const o = await this.obtener(id)
    if (o.tipo !== 'generar' || o.estado !== 'seleccionado') throw new ErrorRespaldo('solicitud')
    return this.ejecutar(o, async () => {
      try {
        const archivo = await this.puertos.generar(o.ruta, this.contexto(o))
        return { estado: 'completado', nombre: basename(archivo), reiniciar: false }
      } catch (e) {
        if (o.abort.signal.aborted && o.cancelable) return { estado: 'cancelado' }
        throw e
      } finally {
        await this.liberar(o)
      }
    })
  }
  async validar(id: string): Promise<ResumenRespaldo | { estado: 'cancelado' }> {
    await this.autorizarInicio(id)
    const o = await this.obtener(id)
    if (o.tipo !== 'cargar' || o.estado !== 'seleccionado') throw new ErrorRespaldo('solicitud')
    return this.ejecutar(o, async () => {
      try {
        let bytes: number
        try {
          bytes = await this.puertos.tamano(o.ruta)
        } catch (e) {
          throw diagnosticarRespaldo(e, 'BACKUP_PRIVATE_PREPARATION_FAILED', 'leer_seleccion')
        }
        o.preparado = await this.puertos.preparar(o.ruta, this.contexto(o))
        o.abort.signal.throwIfAborted()
        await this.obtener(id)
        o.preparacionId = randomUUID()
        o.estado = 'listo'
        return {
          operacionId: o.id,
          preparacionId: o.preparacionId,
          nombre: o.nombre,
          bytes,
          fecha: o.preparado.manifest.created_at_utc,
          version: o.preparado.manifest.app_version
        }
      } catch (e) {
        await this.liberar(o)
        if (o.abort.signal.aborted) return { estado: 'cancelado' }
        throw e
      }
    })
  }
  async cargar(id: string, preparacionId: string, password: string): Promise<ResultadoRespaldo> {
    await this.autorizarInicio(id)
    const o = await this.obtener(id)
    if (o.estado !== 'listo' || !o.preparado || o.preparacionId !== preparacionId)
      throw new ErrorRespaldo('solicitud')
    o.estado = 'autorizando'
    const tarea = (async (): Promise<ResultadoRespaldo> => {
      try {
        await this.puertos.credencial(password)
        await this.obtener(id)
        o.abort.signal.throwIfAborted()
      } catch (e) {
        if (o.abort.signal.aborted) {
          await this.liberar(o)
          return { estado: 'cancelado' }
        }
        if (e instanceof ErrorRespaldo && ['password', 'autenticacion'].includes(e.codigo))
          o.estado = 'listo'
        else await this.liberar(o)
        throw e
      }
      o.estado = 'trabajando'
      try {
        await this.puertos.cargar(o.preparado!, this.contexto(o), o.usuario)
        o.preparado = undefined // El caso seguro ya completó su finally de limpieza.
        this.puertos.bloquearHastaReinicio()
        o.estado = 'reinicio'
        o.cancelable = false
        return { estado: 'completado', reiniciar: true }
      } catch (e) {
        await this.liberar(o)
        if (o.abort.signal.aborted && o.cancelable) return { estado: 'cancelado' }
        throw e
      }
    })()
    o.tarea = tarea
    return tarea
  }
  async cancelar(id: string): Promise<boolean> {
    const o = await this.obtener(id, false)
    if (!o.cancelable) return false
    o.abort.abort()
    if (['trabajando', 'autorizando'].includes(o.estado)) await o.tarea?.catch(() => {})
    else await this.liberar(o)
    return true
  }
  async reiniciar(id: string): Promise<void> {
    const o = await this.obtener(id, false)
    if (o.estado !== 'reinicio') throw new ErrorRespaldo('solicitud')
    o.reinicio ??= Promise.resolve()
      .then(() => this.puertos.reiniciar())
      .catch((e) => {
        o.reinicio = undefined
        throw e
      })
    await o.reinicio
  }
  async cerrar(): Promise<void> {
    this.cerrado = true
    const o = this.operacion
    if (!o) return
    if (o.cancelable) await this.cancelar(o.id)
    else await o.tarea?.catch(() => {})
  }
}
