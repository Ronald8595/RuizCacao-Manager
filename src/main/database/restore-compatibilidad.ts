import type { Pool } from 'pg'
import { firmaEstructura } from './restore-validacion'
import { ErrorDiagnosticoRespaldo } from './respaldo-diagnostico'

// Variante histórica documentada en el informe 1.1.2, sección 7, y comprobada
// en el .back de esquema 10. No se aplica al origen ni a la base restaurada.
// Preservar ambas semánticas: no son financieramente intercambiables.
export const vistaFlujoHistorica = `CREATE OR REPLACE VIEW ruizcacao.v_flujo_caja AS
 SELECT m.id,m.fecha,c.categoria,
 (CASE WHEN c.categoria='compra' THEN -1 ELSE 1 END *
  CASE WHEN m.tipo='Ajuste por devolución' THEN -1 ELSE 1 END)::numeric * m.monto AS monto
 FROM ruizcacao.movimientos_cuenta m JOIN ruizcacao.cuentas c ON c.id=m.cuenta_id
 WHERE m.tipo IN ('Abono','Ajuste por devolución')
 UNION ALL SELECT id,fecha,'gasto_operativo',-monto FROM ruizcacao.gastos WHERE tipo='manual';`

/** Selecciona una referencia completa de confianza, nunca excepciones por objeto.
 * referencia es exclusivamente la BD efímera creada por WorkspaceRestorePostgres.
 * Una discrepancia adicional revierte la selección y mantiene el rechazo estricto.
 */
export async function seleccionarReferenciaRestore(
  staging: Pool,
  referencia: Pool,
  version: number
): Promise<'actual' | 'historica_devoluciones'> {
  const firma = await firmaEstructura(staging)
  if (firma === (await firmaEstructura(referencia))) return 'actual'
  if (version !== 10) throw new ErrorDiagnosticoRespaldo('BACKUP_SCHEMA_MISMATCH', 'firma_catalogo')
  const db = await referencia.connect()
  try {
    await db.query('BEGIN')
    await db.query(vistaFlujoHistorica)
    if (firma !== (await firmaEstructura(db)))
      throw new ErrorDiagnosticoRespaldo('BACKUP_SCHEMA_MISMATCH', 'firma_catalogo')
    await db.query('COMMIT')
    return 'historica_devoluciones'
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally {
    db.release()
  }
}
