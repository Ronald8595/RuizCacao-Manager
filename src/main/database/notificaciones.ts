import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import { ErrorNegocio } from '../../shared/errorNegocio'
import type { Aviso, Notificaciones } from '../../shared/persistencia'
import { asignarAvisosHistoricos } from './migracion-diez'

export function validarIdAviso(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
    throw new ErrorNegocio('La notificación no es válida.')
}

// Los eventos generales conservan su audiencia: todos los usuarios existentes,
// también los inactivos. El estado de cada copia pertenece a su destinatario.
export async function publicarAviso(
  db: Pick<PoolClient, 'query'>,
  titulo: string,
  mensaje: string,
  clave?: string,
  destino?: string
): Promise<void> {
  await db.query(
    `INSERT INTO ruizcacao.notificaciones(id,titulo,mensaje,evento_clave,destino,usuario_id)
     SELECT md5($1::text || u.id::text)::uuid,$2,$3,$4,$5,u.id FROM ruizcacao.usuarios u
     ON CONFLICT(usuario_id,evento_clave) DO NOTHING`,
    [randomUUID(), titulo, mensaje, clave ?? null, destino ?? null]
  )
}

export async function consultarNotificaciones(
  db: Pick<PoolClient, 'query'>,
  usuarioId: string
): Promise<Notificaciones> {
  const avisos: Aviso[] = (
    await db.query(
      'SELECT id,titulo,mensaje,fecha,leida,destino FROM ruizcacao.notificaciones WHERE usuario_id=$1 ORDER BY fecha DESC,id DESC',
      [usuarioId]
    )
  ).rows.map((r) => ({ ...r, fecha: r.fecha.toISOString() }))
  return { avisos, noLeidas: avisos.reduce((n, a) => n + Number(!a.leida), 0) }
}

export async function limpiarAvisos(
  db: Pick<PoolClient, 'query'>,
  usuarioId: string
): Promise<void> {
  await db.query(asignarAvisosHistoricos)
  await db.query(
    "DELETE FROM ruizcacao.notificaciones WHERE usuario_id=$1 AND leida AND fecha<=CURRENT_TIMESTAMP-interval '48 hours'",
    [usuarioId]
  )
}
