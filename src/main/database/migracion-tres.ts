export const VERSION_ESQUEMA = 3
export const migracionTres = `
ALTER TABLE ruizcacao.administrador ALTER COLUMN recovery_hash DROP NOT NULL;
COMMENT ON COLUMN ruizcacao.administrador.recovery_hash IS 'Deprecado desde v3. No se utiliza para recuperar acceso.';
CREATE TABLE ruizcacao.instalacion(id integer PRIMARY KEY CHECK(id=1), installation_id uuid NOT NULL UNIQUE);
CREATE TABLE ruizcacao.solicitudes_recuperacion(
 request_id uuid PRIMARY KEY, administrador_id integer NOT NULL REFERENCES ruizcacao.administrador(id),
 installation_id uuid NOT NULL REFERENCES ruizcacao.instalacion(installation_id), version integer NOT NULL CHECK(version=1),
 nonce text NOT NULL, proposito text NOT NULL CHECK(proposito='recovery_password'),
 estado text NOT NULL CHECK(estado IN ('activa','invalidada','utilizada')), creada_en timestamptz NOT NULL DEFAULT now(), utilizada_en timestamptz);
CREATE UNIQUE INDEX recuperacion_activa_unica ON ruizcacao.solicitudes_recuperacion(administrador_id) WHERE estado='activa';
CREATE TABLE ruizcacao.control_recuperacion(id integer PRIMARY KEY CHECK(id=1), fallos integer NOT NULL DEFAULT 0, bloqueado_hasta timestamptz);
INSERT INTO ruizcacao.control_recuperacion(id) VALUES(1);
ALTER TABLE ruizcacao.notificaciones ADD COLUMN evento_clave text UNIQUE, ADD COLUMN destino text CHECK(destino IN ('inicio','cuentas','consultas','stock'));
CREATE TABLE ruizcacao.respaldos(id uuid PRIMARY KEY, fecha timestamptz NOT NULL DEFAULT now(), archivo text NOT NULL,
 tipo text NOT NULL CHECK(tipo IN ('automatico','manual','pre_migracion','pre_restauracion')), fecha_jornada date,
 revision text NOT NULL, esquema_version integer NOT NULL, postgres_major integer NOT NULL, tamano bigint NOT NULL CHECK(tamano>0), sha256 text NOT NULL,
 estado text NOT NULL DEFAULT 'valido' CHECK(estado IN ('valido','retirado')));
CREATE UNIQUE INDEX respaldo_automatico_equivalente ON ruizcacao.respaldos(fecha_jornada,revision) WHERE tipo='automatico' AND estado='valido';
`
