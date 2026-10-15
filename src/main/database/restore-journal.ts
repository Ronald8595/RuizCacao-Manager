import { open, readFile, rename, stat, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { ErrorNegocio } from '../../shared/errorNegocio'
export type FaseRestore =
  | 'preparada'
  | 'mantenimiento'
  | 'seguridad_creada'
  | 'original_renombrada'
  | 'candidata_promovida'
  | 'validada'
  | 'confirmada'
  | 'revertida'
export interface EstadoJournal {
  operation_id: string
  phase: FaseRestore
  intent: string
  cluster_identity: string
  active_database: 'ruizcacao_manager'
  candidate_database: string
  reserve_database: string
  active_oid: number
  candidate_oid: number
  backup_sha256: string
  created_at: string
  updated_at: string
}
export interface RestoreJournal {
  leer(): Promise<EstadoJournal | null>
  guardar(estado: EstadoJournal): Promise<void>
}
export function validarJournal(v: unknown): EstadoJournal {
  const j = v as EstadoJournal
  const keys = [
    'operation_id',
    'phase',
    'intent',
    'cluster_identity',
    'active_database',
    'candidate_database',
    'reserve_database',
    'active_oid',
    'candidate_oid',
    'backup_sha256',
    'created_at',
    'updated_at'
  ]
  if (
    !j ||
    typeof j !== 'object' ||
    Object.keys(j).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(j, k)) ||
    typeof j.operation_id !== 'string' ||
    !/^[a-f0-9]{32}$/.test(j.operation_id) ||
    ![
      'preparada',
      'mantenimiento',
      'seguridad_creada',
      'original_renombrada',
      'candidata_promovida',
      'validada',
      'confirmada',
      'revertida'
    ].includes(j.phase) ||
    ![
      'ninguna',
      'bloquear_original',
      'renombrar_original',
      'promover_candidata',
      'validar',
      'confirmar',
      'revertir'
    ].includes(j.intent) ||
    typeof j.cluster_identity !== 'string' ||
    !/^\d+$/.test(j.cluster_identity) ||
    j.active_database !== 'ruizcacao_manager' ||
    j.candidate_database !== 'rcm_c_' + j.operation_id ||
    j.reserve_database !== 'rcm_r_' + j.operation_id ||
    !Number.isSafeInteger(j.active_oid) ||
    j.active_oid <= 0 ||
    !Number.isSafeInteger(j.candidate_oid) ||
    j.candidate_oid <= 0 ||
    j.active_oid === j.candidate_oid ||
    !/^[a-f0-9]{64}$/.test(j.backup_sha256) ||
    !Number.isFinite(Date.parse(j.created_at)) ||
    !Number.isFinite(Date.parse(j.updated_at))
  )
    throw new ErrorNegocio(
      'El registro de carga necesita revisión técnica. Se conservaron las bases.'
    )
  return j
}
export class JournalRestauracionArchivo implements RestoreJournal {
  constructor(private readonly archivo: string) {}
  async leer(): Promise<EstadoJournal | null> {
    try {
      if ((await stat(this.archivo)).size > 16384)
        throw new ErrorNegocio('Registro de carga inválido.')
      return validarJournal(JSON.parse(await readFile(this.archivo, 'utf8')))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  }
  async guardar(estado: EstadoJournal): Promise<void> {
    validarJournal(estado)
    const temporal = this.archivo + '.' + randomUUID() + '.tmp'
    const f = await open(temporal, 'wx', 0o600)
    try {
      await f.writeFile(JSON.stringify(estado))
      await f.sync()
    } finally {
      await f.close()
    }
    try {
      await rename(temporal, this.archivo)
    } finally {
      await unlink(temporal).catch(() => {})
    }
  }
}
