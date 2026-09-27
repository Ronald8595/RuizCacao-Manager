-- Migración 7: anulaciones y operaciones confirmadas inmutables.

ALTER TABLE ruizcacao.compras ADD COLUMN estado text NOT NULL DEFAULT 'vigente' CHECK(estado IN ('vigente','anulada')),
 ADD COLUMN anulada_en timestamptz, ADD COLUMN anulada_por_usuario_id uuid REFERENCES ruizcacao.usuarios(id),
 ADD COLUMN anulada_por_nombre text, ADD COLUMN motivo_anulacion text;
ALTER TABLE ruizcacao.ventas ADD COLUMN estado text NOT NULL DEFAULT 'vigente' CHECK(estado IN ('vigente','anulada')),
 ADD COLUMN anulada_en timestamptz, ADD COLUMN anulada_por_usuario_id uuid REFERENCES ruizcacao.usuarios(id),
 ADD COLUMN anulada_por_nombre text, ADD COLUMN motivo_anulacion text;
-- Las anulaciones antiguas conservan lo conocido; no se inventan autor ni devoluciones.
UPDATE ruizcacao.compras p SET estado='anulada',anulada_en=c.fecha_ultimo_movimiento,motivo_anulacion=c.motivo_anulacion
 FROM ruizcacao.cuentas c WHERE c.compra_id=p.id AND c.estado='anulado';
CREATE OR REPLACE VIEW ruizcacao.v_saldos AS SELECT id,categoria,cliente_id,proveedor_id,monto_total,monto_aplicado,monto_total-monto_aplicado AS saldo
 FROM ruizcacao.cuentas WHERE estado<>'anulado';
CREATE OR REPLACE VIEW ruizcacao.v_flujo_caja AS
 SELECT m.id,m.fecha,c.categoria,
 CASE WHEN c.categoria='compra' THEN -m.monto ELSE m.monto END AS monto
 FROM ruizcacao.movimientos_cuenta m JOIN ruizcacao.cuentas c ON c.id=m.cuenta_id
 WHERE m.tipo='Abono' AND c.estado<>'anulado'
 UNION ALL SELECT id,fecha,'gasto_operativo',-monto FROM ruizcacao.gastos WHERE tipo='manual';
-- Impide alterar datos comerciales, incluso mediante SQL directo. Los abonos
-- actualizan las cuentas; el comprobante de la venta conserva sus valores originales.
CREATE FUNCTION ruizcacao.proteger_operacion_confirmada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE permitidas text[] := ARRAY['estado','anulada_en','anulada_por_usuario_id','anulada_por_nombre','motivo_anulacion','actualizado_en'];
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Las operaciones confirmadas no se eliminan.'; END IF;
 IF (to_jsonb(NEW)-permitidas) IS DISTINCT FROM (to_jsonb(OLD)-permitidas) THEN
  RAISE EXCEPTION 'Las operaciones confirmadas no se editan.';
 END IF;
 IF OLD.estado='anulada' AND (to_jsonb(NEW)-'actualizado_en') IS DISTINCT FROM (to_jsonb(OLD)-'actualizado_en') THEN
  RAISE EXCEPTION 'Esta operación ya fue anulada.';
 END IF;
 IF OLD.estado='vigente' AND NEW.estado='anulada' AND
  (NEW.anulada_en IS NULL OR NEW.anulada_por_usuario_id IS NULL OR nullif(btrim(NEW.anulada_por_nombre),'') IS NULL OR nullif(btrim(NEW.motivo_anulacion),'') IS NULL) THEN
  RAISE EXCEPTION 'Completa los datos de la anulación.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER compra_confirmada_inmutable BEFORE UPDATE OR DELETE ON ruizcacao.compras FOR EACH ROW EXECUTE FUNCTION ruizcacao.proteger_operacion_confirmada();
CREATE TRIGGER venta_confirmada_inmutable BEFORE UPDATE OR DELETE ON ruizcacao.ventas FOR EACH ROW EXECUTE FUNCTION ruizcacao.proteger_operacion_confirmada();
