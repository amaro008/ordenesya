-- ============================================================
-- ORDENESYA — Migración v2
-- Correr en: Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Clientes: id_sap único, cadena para agrupar
ALTER TABLE oya_clientes
  ADD COLUMN IF NOT EXISTS id_sap  TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS cadena  TEXT;

CREATE INDEX IF NOT EXISTS idx_oya_clientes_id_sap ON oya_clientes (id_sap);
CREATE INDEX IF NOT EXISTS idx_oya_clientes_cadena ON oya_clientes (LOWER(cadena));

-- 2. Órdenes: totales de la OC original
ALTER TABLE oya_ordenes
  ADD COLUMN IF NOT EXISTS subtotal_oc NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS iva_oc      NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS total_oc    NUMERIC(14,2);

-- 3. Detalles: precio e importe por línea
ALTER TABLE oya_detalles_orden
  ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS importe         NUMERIC(14,2);

-- 4. Fix RLS oya_skus: permite escritura autenticada (necesario para carga desde UI)
DROP POLICY IF EXISTS "oya_skus_write" ON oya_skus;
CREATE POLICY "oya_skus_write" ON oya_skus
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
