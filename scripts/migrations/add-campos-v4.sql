-- ============================================================
-- ORDENESYA — Migración v4
-- Tabla de configuración global de la app
-- ============================================================

CREATE TABLE IF NOT EXISTS oya_configuracion (
  clave      TEXT PRIMARY KEY,
  valor      TEXT NOT NULL,
  descripcion TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Valores por defecto
INSERT INTO oya_configuracion (clave, valor, descripcion) VALUES
  ('ai_provider', 'claude', 'Proveedor de IA: claude o gemini'),
  ('ai_model',    'claude-haiku-4-5', 'Modelo de IA activo')
ON CONFLICT (clave) DO NOTHING;

-- RLS: cualquier usuario autenticado puede leer, solo service role escribe
ALTER TABLE oya_configuracion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oya_config_read" ON oya_configuracion
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "oya_config_write" ON oya_configuracion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE oya_configuracion IS 'Configuración global de la aplicación';
