import { operacionesRespaldos, faseOperacion, type ContextoOperacion } from './operacion-respaldo'
import type { RestoreWorkspace, RestorePreparado } from './restore-workspace'
import type { EstadoJournal, RestoreJournal } from './restore-journal'
import type { DatabasePromotion } from './restore-promocion'
export interface RestoreTarget {
  comprobarSoporte(): Promise<void>
  candidata(p: RestorePreparado, ctx: ContextoOperacion): Promise<EstadoJournal>
  respaldoSeguridad(ctx: ContextoOperacion): Promise<void>
  validarFinal(p: RestorePreparado): Promise<void>
  limpiarCandidata(j: EstadoJournal): Promise<void>
}
export interface RestoreMaintenance {
  entrar(): Promise<void>
  cerrarPool(): Promise<void>
  reconectar(): Promise<void>
  salir(seguro: boolean): void
}
export class RestaurarRespaldoSeguro {
  constructor(
    private readonly workspace: RestoreWorkspace,
    private readonly destino: RestoreTarget,
    private readonly journal: RestoreJournal,
    private readonly promocion: DatabasePromotion,
    private readonly mantenimiento: RestoreMaintenance,
    private readonly reportarRecuperacion: (e: unknown) => void = () => {},
    private readonly despuesConfirmar: () => void = () => {}
  ) {}
  async ejecutar(
    archivo: string,
    confirmar: () => Promise<boolean>,
    ctx: ContextoOperacion = {}
  ): Promise<{ operation_id: string; mantenimiento_ms: number; advertencias: string[] }> {
    const advertencias: string[] = []
    const lease = operacionesRespaldos.adquirir('restore')
    ctx = {
      ...ctx,
      signal: ctx.signal
        ? AbortSignal.any([ctx.signal, lease.contexto.signal!])
        : lease.contexto.signal
    }
    let p: RestorePreparado | undefined,
      j: EstadoJournal | undefined,
      critica = false,
      enMantenimiento = false,
      seguro = true,
      desde = 0
    try {
      await this.destino.comprobarSoporte()
      p = await this.workspace.preparar(archivo, ctx)
      faseOperacion(ctx, 'preparando_candidata')
      j = await this.destino.candidata(p, ctx)
      await this.journal.guardar(j)
      faseOperacion(ctx, 'antes_mantenimiento')
      desde = performance.now()
      enMantenimiento = true
      await this.mantenimiento.entrar()
      j.phase = 'mantenimiento'
      j.updated_at = new Date().toISOString()
      await this.journal.guardar(j)
      faseOperacion(ctx, 'pre_restauracion')
      await this.destino.respaldoSeguridad(ctx)
      j.phase = 'seguridad_creada'
      j.updated_at = new Date().toISOString()
      await this.journal.guardar(j)
      if (!(await confirmar()))
        throw Object.assign(new Error('Carga cancelada.'), { name: 'AbortError' })
      faseOperacion(ctx, 'antes_promocion')
      lease.critica()
      critica = true
      seguro = false
      await this.mantenimiento.cerrarPool()
      await this.promocion.promover(j, () => this.destino.validarFinal(p!))
      await this.mantenimiento.reconectar()
      await this.promocion.confirmar(j)
      this.despuesConfirmar()
      seguro = true
      return {
        operation_id: j.operation_id,
        mantenimiento_ms: performance.now() - desde,
        advertencias
      }
    } catch (e) {
      if (j) {
        try {
          if (critica) await this.mantenimiento.cerrarPool()
          await this.promocion.recuperar()
          if (critica) await this.mantenimiento.reconectar()
          seguro = true
        } catch (recuperacionError) {
          this.reportarRecuperacion(recuperacionError)
          seguro = false
        }
        if (!critica && seguro)
          await this.destino.limpiarCandidata(j).catch(this.reportarRecuperacion)
      }
      throw e
    } finally {
      if (enMantenimiento) this.mantenimiento.salir(seguro)
      try {
        await p?.limpiar()
      } catch (error) {
        this.reportarRecuperacion(error)
        if (j?.phase === 'confirmada')
          advertencias.push('La carga se confirmó; la limpieza técnica necesita revisión.')
      } finally {
        lease.liberar()
      }
    }
  }
}
