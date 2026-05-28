-- ============================================================
-- ORDENESYA — Migración v4
-- Tabla de configuración global
-- ============================================================

CREATE TABLE IF NOT EXISTS oya_configuracion (
  clave       TEXT PRIMARY KEY,
  valor       TEXT NOT NULL,
  descripcion TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice único explícito (necesario para upsert vía Supabase API)
CREATE UNIQUE INDEX IF NOT EXISTS idx_oya_configuracion_clave ON oya_configuracion (clave);

-- Valores por defecto
INSERT INTO oya_configuracion (clave, valor, descripcion) VALUES
  ('ai_provider', 'claude',          'Proveedor de IA activo: claude o gemini'),
  ('ai_model',    'claude-haiku-4-5','Modelo de IA activo')
ON CONFLICT (clave) DO NOTHING;

-- RLS
ALTER TABLE oya_configuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oya_config_read"  ON oya_configuracion;
DROP POLICY IF EXISTS "oya_config_write" ON oya_configuracion;

CREATE POLICY "oya_config_read" ON oya_configuracion
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "oya_config_write" ON oya_configuracion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
