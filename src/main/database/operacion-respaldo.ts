import { ErrorNegocio } from '../../shared/errorNegocio'
export interface ContextoOperacion {
  signal?: AbortSignal
  fase?: (nombre: string) => void
}
export function faseOperacion(ctx: ContextoOperacion | undefined, fase: string): void {
  ctx?.signal?.throwIfAborted()
  ctx?.fase?.(fase)
  ctx?.signal?.throwIfAborted()
}
/** Exclusión en proceso, sin timers ni trabajo cuando está inactivo. */
export class RestoreOperationController {
  private backup = false
  private restore = false
  private critica = false
  private pendientes = new Set<AbortController>()
  private esperas: Array<() => void> = []
  adquirir(tipo: 'backup' | 'restore'): {
    contexto: ContextoOperacion
    cancelar: () => boolean
    liberar: () => void
    critica: () => void
  } {
    if (this.critica || (tipo === 'backup' ? this.backup : this.restore))
      throw new ErrorNegocio('Ya hay una operación de respaldos en curso.')
    if (tipo === 'backup') this.backup = true
    else this.restore = true
    const abort = new AbortController()
    this.pendientes.add(abort)
    let liberado = false
    return {
      contexto: { signal: abort.signal },
      cancelar: () => {
        if (this.critica || liberado) return false
        abort.abort()
        return true
      },
      critica: () => {
        abort.signal.throwIfAborted()
        if (this.backup)
          throw new ErrorNegocio('Espera a que termine el respaldo antes de cargar información.')
        this.critica = true
      },
      liberar: () => {
        if (liberado) return
        liberado = true
        this.pendientes.delete(abort)
        if (tipo === 'backup') this.backup = false
        else {
          this.restore = false
          this.critica = false
        }
        if (!this.backup && !this.restore) {
          for (const resolver of this.esperas.splice(0)) resolver()
        }
      }
    }
  }
  cancelarAlCerrar(): boolean {
    if (this.critica) return false
    for (const c of this.pendientes) c.abort()
    return true
  }
  get estado(): Readonly<{ backup: boolean; restore: boolean; critica: boolean }> {
    return { backup: this.backup, restore: this.restore, critica: this.critica }
  }
  esperar(): Promise<void> {
    if (!this.backup && !this.restore) return Promise.resolve()
    return new Promise((resolve) => this.esperas.push(resolve))
  }
}
export const operacionesRespaldos = new RestoreOperationController()
