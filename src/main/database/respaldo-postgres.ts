import type { Pool } from 'pg'
import type { Respaldos } from './respaldos'
import type { BackupExporter, ExportacionRespaldo } from './respaldo-portable'
import type { ContextoOperacion } from './operacion-respaldo'

export class ExportadorRespaldoPostgres implements BackupExporter {
  constructor(
    private readonly respaldos: Respaldos,
    private readonly pool: Pool
  ) {}
  exportar(destino: string, ctx?: ContextoOperacion): Promise<ExportacionRespaldo> {
    return this.respaldos.exportar(this.pool, destino, ctx)
  }
}
