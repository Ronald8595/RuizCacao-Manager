-- Migración 9: índices medidos para historiales paginados de Compras y Ventas.

-- Comparación ABBA aislada: LIMIT/keyset deja de recorrer 10.000/15.000 operaciones.
CREATE INDEX compras_orden_id ON ruizcacao.compras (orden DESC,id DESC);
CREATE INDEX ventas_orden_id ON ruizcacao.ventas (orden DESC,id DESC);
