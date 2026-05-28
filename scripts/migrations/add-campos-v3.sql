-- ============================================================
-- ORDENESYA — Migración v3
-- Agrega: comedor_detectado en oya_ordenes
-- Quita obligatoriedad de id_sap (ya era opcional en código)
-- ============================================================

ALTER TABLE oya_ordenes
  ADD COLUMN IF NOT EXISTS comedor_detectado TEXT;

COMMENT ON COLUMN oya_ordenes.comedor_detectado IS
  'Comedor/ubicación específica detectado de la OC (Borgwarner, Navistar, etc.) — informativo';

-- Índice para búsquedas por comedor
CREATE INDEX IF NOT EXISTS idx_oya_ordenes_comedor ON oya_ordenes (comedor_detectado);
