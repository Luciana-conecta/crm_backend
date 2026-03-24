-- ============================================================
-- Migration 004: Canales Sociales
-- ============================================================

CREATE TABLE IF NOT EXISTS canales_sociales (
  id           SERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL REFERENCES empresas(empresa_id) ON DELETE CASCADE,
  plataforma   VARCHAR(50) NOT NULL,
    -- instagram | facebook | tiktok | twitter | linkedin | telegram
  nombre       VARCHAR(150),
  page_id      VARCHAR(255),
  access_token TEXT,
  username     VARCHAR(150),
  page_url     VARCHAR(500),
  activo       BOOLEAN DEFAULT true,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canales_sociales_empresa     ON canales_sociales(empresa_id);
CREATE INDEX IF NOT EXISTS idx_canales_sociales_plataforma  ON canales_sociales(plataforma);
