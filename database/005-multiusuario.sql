-- Migración 5: multiusuario y trazabilidad por operador.

CREATE TABLE ruizcacao.usuarios(
 id uuid PRIMARY KEY,
 nombre text NOT NULL CHECK(char_length(trim(nombre)) BETWEEN 3 AND 80),
 password_hash text NOT NULL,
 rol text NOT NULL CHECK(rol IN ('administrador','operador')),
 activo boolean NOT NULL DEFAULT true,
 principal boolean NOT NULL DEFAULT false,
 fallos integer NOT NULL DEFAULT 0,
 bloqueado_hasta timestamptz,
 creado_en timestamptz NOT NULL DEFAULT now(),
 actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuario_nombre_unico ON ruizcacao.usuarios((lower(nombre)));
CREATE UNIQUE INDEX usuario_principal_unico ON ruizcacao.usuarios((principal)) WHERE principal;

ALTER TABLE ruizcacao.sesiones ADD COLUMN usuario_id uuid REFERENCES ruizcacao.usuarios(id);
ALTER TABLE ruizcacao.auditoria ADD COLUMN usuario_id uuid REFERENCES ruizcacao.usuarios(id);
ALTER TABLE ruizcacao.eventos_jornada ADD COLUMN usuario_id uuid REFERENCES ruizcacao.usuarios(id);
ALTER TABLE ruizcacao.operaciones ADD COLUMN usuario_id uuid REFERENCES ruizcacao.usuarios(id);

ALTER TABLE ruizcacao.compras ADD COLUMN usuario_id uuid REFERENCES ruizcacao.usuarios(id), ADD COLUMN usuario_nombre text;
ALTER TABLE ruizcacao.ventas ADD COLUMN usuario_id uuid REFERENCES ruizcacao.usuarios(id), ADD COLUMN usuario_nombre text;
ALTER TABLE ruizcacao.cuentas ADD COLUMN usuario_id uuid REFERENCES ruizcacao.usuarios(id), ADD COLUMN usuario_nombre text;
ALTER TABLE ruizcacao.movimientos_cuenta ADD COLUMN usuario_id uuid REFERENCES ruizcacao.usuarios(id), ADD COLUMN usuario_nombre text;
ALTER TABLE ruizcacao.movimientos_stock ADD COLUMN usuario_id uuid REFERENCES ruizcacao.usuarios(id), ADD COLUMN usuario_nombre text;
ALTER TABLE ruizcacao.gastos ADD COLUMN usuario_id uuid REFERENCES ruizcacao.usuarios(id), ADD COLUMN usuario_nombre text;

