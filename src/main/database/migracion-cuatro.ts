export const VERSION_ACTUAL = 4
export const migracionCuatro = `
ALTER TABLE ruizcacao.jornadas DROP CONSTRAINT jornadas_estado_check;
ALTER TABLE ruizcacao.jornadas ADD CONSTRAINT jornadas_estado_check CHECK(estado IN ('activa','finalizada','interrumpida'));
CREATE UNIQUE INDEX jornada_pendiente_unica ON ruizcacao.jornadas((true)) WHERE estado IN ('activa','interrumpida');
ALTER TABLE ruizcacao.productos ADD COLUMN umbral_stock numeric(18,2) CHECK(umbral_stock>=0);
COMMENT ON COLUMN ruizcacao.productos.umbral_stock IS 'QQ; NULL desactiva alertas de stock bajo. Sin valor predeterminado de negocio.';
`
