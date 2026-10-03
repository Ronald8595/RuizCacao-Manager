export const VERSION_ACTUAL = 10

// Los avisos antiguos eran compartidos. Conservar el ID original para el primer
// destinatario y copiar el contenido para los demás permite acciones independientes.
// Si aún no hay usuarios, conservar los originales hasta la primera sesión.
export const asignarAvisosHistoricos = `
WITH destinatarios AS MATERIALIZED (
  SELECT id, row_number() OVER (ORDER BY principal DESC, creado_en, id) posicion
  FROM ruizcacao.usuarios
), originales AS MATERIALIZED (
  SELECT * FROM ruizcacao.notificaciones WHERE usuario_id IS NULL
), copias AS (
  INSERT INTO ruizcacao.notificaciones(id,titulo,mensaje,fecha,leida,evento_clave,destino,usuario_id)
  SELECT md5(n.id::text || u.id::text)::uuid,n.titulo,n.mensaje,n.fecha,n.leida,n.evento_clave,n.destino,u.id
  FROM originales n CROSS JOIN destinatarios u WHERE u.posicion>1
  ON CONFLICT(usuario_id,evento_clave) DO NOTHING
)
UPDATE ruizcacao.notificaciones n SET usuario_id=u.id
FROM destinatarios u WHERE u.posicion=1 AND n.usuario_id IS NULL;
`

export const migracionDiez = `
ALTER TABLE ruizcacao.notificaciones
  ADD COLUMN usuario_id uuid REFERENCES ruizcacao.usuarios(id),
  DROP CONSTRAINT notificaciones_evento_clave_key,
  ADD CONSTRAINT notificaciones_usuario_evento_key UNIQUE(usuario_id,evento_clave);
${asignarAvisosHistoricos}
`
