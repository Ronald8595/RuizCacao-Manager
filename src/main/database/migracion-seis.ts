export const VERSION_ACTUAL = 6
export const migracionSeis = `
ALTER TABLE ruizcacao.configuracion
  ADD COLUMN stock_inicial_registrado boolean NOT NULL DEFAULT false,
  ADD COLUMN stock_inicial_registrado_en timestamptz,
  ADD COLUMN stock_inicial_usuario_id uuid REFERENCES ruizcacao.usuarios(id);

COMMENT ON COLUMN ruizcacao.configuracion.stock_inicial_registrado IS 'Impide repetir la carga única de inventario existente previo al uso del sistema.';
COMMENT ON COLUMN ruizcacao.configuracion.stock_inicial_registrado_en IS 'Fecha/hora en que se confirmó la carga inicial de inventario.';
COMMENT ON COLUMN ruizcacao.configuracion.stock_inicial_usuario_id IS 'Administrador que confirmó la carga inicial de inventario.';
`
