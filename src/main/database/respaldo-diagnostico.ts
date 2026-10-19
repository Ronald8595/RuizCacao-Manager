import { ErrorNegocio } from '../../shared/errorNegocio'
import { registrarEventoRespaldo } from './errores'

const codigos = {
  BACKUP_INVALID_EXTENSION: 'invalido',
  BACKUP_INVALID_CONTAINER: 'invalido',
  BACKUP_INVALID_MANIFEST: 'invalido',
  BACKUP_PRODUCT_MISMATCH: 'invalido',
  BACKUP_FORMAT_UNSUPPORTED: 'futuro',
  BACKUP_CRC_MISMATCH: 'danado',
  BACKUP_HASH_MISMATCH: 'danado',
  BACKUP_DUMP_INVALID: 'danado',
  BACKUP_COPY_MISMATCH: 'danado',
  BACKUP_PRIVATE_PREPARATION_FAILED: 'general',
  BACKUP_INSUFFICIENT_SPACE: 'espacio',
  BACKUP_STAGING_START_FAILED: 'general',
  BACKUP_REFERENCE_FAILED: 'general',
  BACKUP_STAGING_RESTORE_FAILED: 'general',
  BACKUP_TOOL_VERSION_MISMATCH: 'invalido',
  BACKUP_INVENTORY_INVALID: 'invalido',
  BACKUP_SCHEMA_MISMATCH: 'invalido',
  BACKUP_SCHEMA_HISTORY_MISMATCH: 'invalido',
  BACKUP_DATA_INVALID: 'invalido',
  BACKUP_MIGRATION_FAILED: 'general',
  BACKUP_NORMALIZATION_FAILED: 'general',
  BACKUP_EXPORT_FAILED: 'general',
  BACKUP_CLEANUP_FAILED: 'general',
  BACKUP_UNCLASSIFIED: 'general'
} as const
export type CodigoDiagnosticoRespaldo = keyof typeof codigos
export class ErrorDiagnosticoRespaldo extends ErrorNegocio {
  readonly codigoRespaldo: string
  constructor(
    readonly codigoTecnico: CodigoDiagnosticoRespaldo,
    readonly fase: string,
    readonly origen?: unknown
  ) {
    super('No se pudo validar o preparar el respaldo.')
    this.codigoRespaldo =
      (origen as { code?: unknown })?.code === 'ENOSPC' ? 'espacio' : codigos[codigoTecnico]
  }
}
export function diagnosticarRespaldo(
  error: unknown,
  codigo: CodigoDiagnosticoRespaldo,
  fase: string
): unknown {
  if (error instanceof ErrorDiagnosticoRespaldo || (error as Error)?.name === 'AbortError')
    return error
  return new ErrorDiagnosticoRespaldo(codigo, fase, error)
}
/** Lista cerrada: jamás serializar el error, su mensaje, SQL, rutas ni stderr. */
export function registrarFalloRespaldo(error: unknown, fase: string): void {
  const e = error instanceof ErrorDiagnosticoRespaldo ? error : undefined
  const origen = (e?.origen ?? error) as { code?: unknown; categoriaHerramienta?: unknown }
  const code = origen?.code
  registrarEventoRespaldo({
    evento: 'fallo',
    codigo: e?.codigoTecnico ?? 'BACKUP_UNCLASSIFIED',
    fase: /^[a-zA-Z_]{1,80}$/.test(e?.fase ?? fase) ? (e?.fase ?? fase) : 'desconocida',
    sistema:
      typeof code === 'number' && Number.isSafeInteger(code)
        ? code
        : typeof code === 'string' &&
            /^(EACCES|EPERM|ENOENT|ENOSPC|EIO|EBUSY|ENAMETOOLONG|ETIMEDOUT|ECONNREFUSED|[0-9][0-9A-Z]{4})$/.test(
              code
            )
          ? code
          : undefined,
    herramienta:
      typeof origen?.categoriaHerramienta === 'string' &&
      /^(access_denied|missing_file|connection|archive|sql|other)$/.test(
        origen.categoriaHerramienta
      )
        ? origen.categoriaHerramienta
        : undefined
  })
}
export function registrarCopiaRespaldo(
  origen: { tamano: number; sha256: string },
  copia: { tamano: number; sha256: string }
): void {
  registrarEventoRespaldo({
    evento: 'copia_privada',
    bytesOrigen: origen.tamano,
    bytesCopia: copia.tamano,
    sha256Origen: origen.sha256,
    sha256Copia: copia.sha256,
    iguales: origen.tamano === copia.tamano && origen.sha256 === copia.sha256
  })
}
