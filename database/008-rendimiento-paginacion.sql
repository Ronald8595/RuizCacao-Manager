-- Migración 8: índice de orden y desempate para historial Stock paginado.

-- Medido con 51.667 movimientos: evita escanear/ordenar todo el historial para LIMIT/keyset.
CREATE INDEX movimientos_stock_orden_id ON ruizcacao.movimientos_stock (orden DESC,id DESC);
