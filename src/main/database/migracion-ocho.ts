export const VERSION_ACTUAL = 8
export const migracionOcho = `
-- Medido con 51.667 movimientos: evita escanear/ordenar todo el historial para LIMIT/keyset.
CREATE INDEX movimientos_stock_orden_id ON ruizcacao.movimientos_stock (orden DESC,id DESC);
`
