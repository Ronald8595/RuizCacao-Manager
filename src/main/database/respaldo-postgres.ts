import type { Pool } from 'pg'
import type { Respaldos } from './respaldos'
import type { BackupExporter, ExportacionRespaldo } from './respaldo-portable'

export class ExportadorRespaldoPostgres implements BackupExporter {
  constructor(
    private readonly respaldos: Respaldos,
    private readonly pool: Pool
  ) {}
  exportar(destino: string): Promise<ExportacionRespaldo> {
    return this.respaldos.exportar(this.pool, destino)
  }
}
