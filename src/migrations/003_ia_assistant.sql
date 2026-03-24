-- ============================================================
-- Migration 003: IA Assistant Module
-- ============================================================

-- Configuración general del asistente por empresa
CREATE TABLE IF NOT EXISTS ia_config (
  id                        SERIAL PRIMARY KEY,
  empresa_id                INTEGER NOT NULL UNIQUE REFERENCES empresas(empresa_id) ON DELETE CASCADE,
  activo                    BOOLEAN DEFAULT false,
  tono                      VARCHAR(50) DEFAULT 'profesional',
    -- profesional | amigable | formal | casual
  industria                 VARCHAR(100),
  descripcion_negocio       TEXT,
  instrucciones_adicionales TEXT,
  created_at                TIMESTAMP DEFAULT NOW(),
  updated_at                TIMESTAMP DEFAULT NOW()
);

-- Productos/servicios del catálogo
CREATE TABLE IF NOT EXISTS ia_productos (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL REFERENCES empresas(empresa_id) ON DELETE CASCADE,
  nombre      VARCHAR(255) NOT NULL,
  descripcion TEXT,
  precio      VARCHAR(100),
  orden       INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Preguntas frecuentes
CREATE TABLE IF NOT EXISTS ia_faqs (
  id         SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(empresa_id) ON DELETE CASCADE,
  pregunta   TEXT NOT NULL,
  respuesta  TEXT NOT NULL,
  orden      INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reglas de escalamiento a humano
CREATE TABLE IF NOT EXISTS ia_reglas_escalamiento (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL REFERENCES empresas(empresa_id) ON DELETE CASCADE,
  condicion   VARCHAR(100) NOT NULL,
    -- intencion_compra | queja | consulta_precio | solicitud_humano | etc.
  descripcion TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Agregar columna asignado_a_humano a conversaciones (si no existe)
ALTER TABLE conversaciones
  ADD COLUMN IF NOT EXISTS asignado_a_humano BOOLEAN DEFAULT false;

-- Índices
CREATE INDEX IF NOT EXISTS idx_ia_config_empresa    ON ia_config(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ia_productos_empresa ON ia_productos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ia_faqs_empresa      ON ia_faqs(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ia_reglas_empresa    ON ia_reglas_escalamiento(empresa_id);
