-- Solo lectura. Ejecutar en Query Tool sobre la base usada por RuizCacao Manager.
SELECT * FROM ruizcacao.migraciones ORDER BY version;

SELECT table_name FROM information_schema.tables
WHERE table_schema='ruizcacao' AND table_type='BASE TABLE' ORDER BY table_name;

SELECT table_name,column_name,data_type,is_nullable
FROM information_schema.columns WHERE table_schema='ruizcacao'
ORDER BY table_name,ordinal_position;

SELECT conrelid::regclass AS tabla,conname AS restriccion,
       pg_get_constraintdef(oid) AS definicion
FROM pg_constraint WHERE connamespace='ruizcacao'::regnamespace
ORDER BY conrelid::regclass::text,conname;

SELECT * FROM ruizcacao.existencias ORDER BY producto;
SELECT * FROM ruizcacao.v_saldos ORDER BY categoria,id;
SELECT fecha,categoria,sum(monto) AS flujo_efectivo
FROM ruizcacao.v_flujo_caja GROUP BY fecha,categoria ORDER BY fecha,categoria;

SELECT fecha,estado,apertura,cierre FROM ruizcacao.jornadas ORDER BY fecha DESC;
SELECT fecha_jornada,accion,responsable,usuario_id,fecha
FROM ruizcacao.eventos_jornada ORDER BY id DESC;
SELECT titulo,mensaje,fecha,leida FROM ruizcacao.notificaciones ORDER BY fecha DESC;

-- Debe devolver cero filas: las entidades comerciales no son documentos JSON.
SELECT table_name FROM information_schema.columns
WHERE table_schema='ruizcacao' AND column_name='datos';

-- Recuperación y respaldos (sin hashes, nonce ni tokens completos).
SELECT max(version) AS version FROM ruizcacao.migraciones;
SELECT count(*) AS tablas FROM information_schema.tables
WHERE table_schema='ruizcacao' AND table_type='BASE TABLE';
SELECT installation_id FROM ruizcacao.instalacion;
SELECT request_id,administrador_id,version,proposito,estado,creada_en,utilizada_en
FROM ruizcacao.solicitudes_recuperacion ORDER BY creada_en DESC;
SELECT estado,count(*) FROM ruizcacao.solicitudes_recuperacion GROUP BY estado;
SELECT id,fallos,bloqueado_hasta FROM ruizcacao.control_recuperacion;
SELECT fecha,tipo,fecha_jornada,revision,esquema_version,postgres_major,tamano,sha256,estado
FROM ruizcacao.respaldos ORDER BY fecha DESC;
SELECT titulo,fecha,leida,evento_clave,destino FROM ruizcacao.notificaciones ORDER BY fecha DESC;
-- 0 filas: nunca más de una solicitud activa por administrador principal.
SELECT administrador_id,count(*) FROM ruizcacao.solicitudes_recuperacion
WHERE estado='activa' GROUP BY administrador_id HAVING count(*)>1;

-- Versión 4: umbrales explícitos y jornadas que requieren resolución.
SELECT nombre,umbral_stock FROM ruizcacao.productos ORDER BY nombre;
SELECT fecha,estado,apertura,cierre FROM ruizcacao.jornadas WHERE estado='interrumpida';
-- Debe ser como máximo 1.
SELECT count(*) AS jornadas_pendientes FROM ruizcacao.jornadas
WHERE estado IN ('activa','interrumpida');

-- Versión 5 / app 1.1.0: multiusuario y trazabilidad.
-- No se consulta password_hash.
SELECT id,nombre,rol,activo,principal,fallos,bloqueado_hasta,creado_en,actualizado_en
FROM ruizcacao.usuarios ORDER BY principal DESC,nombre;
-- Debe devolver exactamente un principal si la instalación ya tiene usuario creado.
SELECT count(*) AS usuarios_principales FROM ruizcacao.usuarios WHERE principal;
-- Las sesiones identifican al usuario cuando existe login asociado.
SELECT s.id,s.usuario_id,u.nombre AS usuario,s.iniciada_en,s.cerrada_en,s.cierre
FROM ruizcacao.sesiones s
LEFT JOIN ruizcacao.usuarios u ON u.id=s.usuario_id
ORDER BY s.iniciada_en DESC;
-- Auditoría y jornada vinculadas al usuario cuando es conocido.
SELECT a.id,a.accion,a.responsable,a.usuario_id,u.nombre AS usuario,a.fecha
FROM ruizcacao.auditoria a
LEFT JOIN ruizcacao.usuarios u ON u.id=a.usuario_id
ORDER BY a.id DESC LIMIT 100;
SELECT e.id,e.fecha_jornada,e.accion,e.responsable,e.usuario_id,u.nombre AS usuario,e.fecha
FROM ruizcacao.eventos_jornada e
LEFT JOIN ruizcacao.usuarios u ON u.id=e.usuario_id
ORDER BY e.id DESC LIMIT 100;
-- Autoría comercial. Los registros heredados de v1.0.0 pueden tener NULL y la UI muestra “Sistema anterior”.
SELECT 'compras' AS entidad,count(*) FILTER (WHERE usuario_id IS NOT NULL) AS con_autor,count(*) AS total FROM ruizcacao.compras
UNION ALL SELECT 'ventas',count(*) FILTER (WHERE usuario_id IS NOT NULL),count(*) FROM ruizcacao.ventas
UNION ALL SELECT 'cuentas',count(*) FILTER (WHERE usuario_id IS NOT NULL),count(*) FROM ruizcacao.cuentas
UNION ALL SELECT 'movimientos_cuenta',count(*) FILTER (WHERE usuario_id IS NOT NULL),count(*) FROM ruizcacao.movimientos_cuenta
UNION ALL SELECT 'movimientos_stock',count(*) FILTER (WHERE usuario_id IS NOT NULL),count(*) FROM ruizcacao.movimientos_stock
UNION ALL SELECT 'gastos',count(*) FILTER (WHERE usuario_id IS NOT NULL),count(*) FROM ruizcacao.gastos;

-- Versión 6 / app 1.1.1: stock inicial de puesta en marcha.
SELECT stock_inicial_registrado,stock_inicial_registrado_en,stock_inicial_usuario_id
FROM ruizcacao.configuracion WHERE id=1;
-- Debe haber como máximo una carga inicial lógica; puede generar un movimiento por producto con cantidad > 0.
SELECT fecha,tipo,producto,entrada_qq,stock_resultante,usuario_nombre,observacion
FROM ruizcacao.movimientos_stock
WHERE tipo='Stock inicial'
ORDER BY fecha_hora_registro,producto;

-- Esquema objetivo 7; historial conservado y anulaciones identificables.
SELECT max(version) = 7 AS esquema_v7 FROM ruizcacao.migraciones;
SELECT estado,count(*) FROM ruizcacao.compras GROUP BY estado;
SELECT estado,count(*) FROM ruizcacao.ventas GROUP BY estado;
SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='ruizcacao' AND table_name IN ('compras','ventas') AND column_name IN ('estado','anulada_en','anulada_por_usuario_id','anulada_por_nombre','motivo_anulacion');
