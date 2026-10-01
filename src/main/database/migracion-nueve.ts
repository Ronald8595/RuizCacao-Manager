export const VERSION_ACTUAL = 9
export const migracionNueve = `
-- Comparación ABBA aislada: LIMIT/keyset deja de recorrer 10.000/15.000 operaciones.
CREATE INDEX compras_orden_id ON ruizcacao.compras (orden DESC,id DESC);
CREATE INDEX ventas_orden_id ON ruizcacao.ventas (orden DESC,id DESC);
`
