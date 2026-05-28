-- ============================================================
-- ORDENESYA — Migración v5
-- Ubicaciones por cadena + UM y conversión en equivalencias
-- ============================================================

-- 1. Tabla de ubicaciones (comedores con ID SAP)
CREATE TABLE IF NOT EXISTS oya_ubicaciones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id  UUID NOT NULL REFERENCES oya_clientes(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,        -- "Borgwarner", "Navistar", "NEMAK SALTILLO"
  id_sap      TEXT,                 -- ID SAP del cliente en esta ubicación
  direccion   TEXT,
  notas       TEXT,
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oya_ubicaciones_cliente ON oya_ubicaciones (cliente_id);
CREATE INDEX IF NOT EXISTS idx_oya_ubicaciones_nombre  ON oya_ubicaciones (cliente_id, LOWER(nombre));

ALTER TABLE oya_ubicaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oya_ubicaciones_all" ON oya_ubicaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE oya_ubicaciones IS 'Comedores/ubicaciones de cada cadena con su ID SAP';

-- 2. Trigger updated_at para ubicaciones
CREATE TRIGGER trg_oya_ubicaciones_updated_at
  BEFORE UPDATE ON oya_ubicaciones
  FOR EACH ROW EXECUTE FUNCTION oya_set_updated_at();

-- 3. Ampliar equivalencias con UM y conversión
ALTER TABLE oya_equivalencias
  ADD COLUMN IF NOT EXISTS um_cliente   TEXT,        -- UM del cliente: CAJA, PZA, KG
  ADD COLUMN IF NOT EXISTS um_sigma     TEXT,        -- UM en SAP/Sigma: KG, PZA, LT
  ADD COLUMN IF NOT EXISTS factor_conv  NUMERIC(10,4) DEFAULT 1; -- 1 CAJA cliente = N um_sigma

COMMENT ON COLUMN oya_equivalencias.um_cliente  IS 'Unidad de medida que usa el cliente en sus OCs';
COMMENT ON COLUMN oya_equivalencias.um_sigma    IS 'Unidad de medida en SAP (la que va en VA01)';
COMMENT ON COLUMN oya_equivalencias.factor_conv IS 'Factor: cantidad_sigma = cantidad_cliente × factor_conv';

-- 4. Agregar ubicacion_id y comedor_detectado a órdenes (si no existen)
ALTER TABLE oya_ordenes
  ADD COLUMN IF NOT EXISTS ubicacion_id UUID REFERENCES oya_ubicaciones(id);

CREATE INDEX IF NOT EXISTS idx_oya_ordenes_ubicacion ON oya_ordenes (ubicacion_id);
