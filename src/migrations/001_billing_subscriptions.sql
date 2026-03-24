-- ============================================================
-- Migration 001: Billing / Subscription Module + Team Management
-- Ejecutar una sola vez en la base de datos
-- ============================================================

-- 1. Agregar campos de trial e is_activo a la tabla planes
ALTER TABLE planes
  ADD COLUMN IF NOT EXISTS trial_dias  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_activo   BOOLEAN DEFAULT true;

-- 2. Agregar columnas de gestión de equipo a usuario_empresa (ya existe)
ALTER TABLE usuario_empresa
  ADD COLUMN IF NOT EXISTS rol        VARCHAR(100) DEFAULT 'Agente',
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 3. Crear tabla pagos (si no existe)
CREATE TABLE IF NOT EXISTS pagos (
  id                SERIAL PRIMARY KEY,
  empresa_id        INTEGER REFERENCES empresas(empresa_id) ON DELETE CASCADE,
  plan_id           INTEGER REFERENCES planes(id),
  monto             DECIMAL(10,2) NOT NULL,
  estado            VARCHAR(20) DEFAULT 'pendiente',
    -- pendiente | pagado | vencido
  fecha_pago        TIMESTAMP,
  fecha_vencimiento TIMESTAMP,
  concepto          VARCHAR(255),
  referencia        VARCHAR(100),
  notas             TEXT,
  created_at        TIMESTAMP DEFAULT NOW()
);

-- 4. Crear tabla suscripciones
CREATE TABLE IF NOT EXISTS suscripciones (
  id                SERIAL PRIMARY KEY,
  empresa_id        INTEGER NOT NULL REFERENCES empresas(empresa_id) ON DELETE CASCADE,
  plan_id           INTEGER NOT NULL REFERENCES planes(id),
  estado            VARCHAR(20) NOT NULL DEFAULT 'trial',
    -- trial | activa | vencida | cancelada | suspendida
  fecha_inicio      TIMESTAMP NOT NULL DEFAULT NOW(),
  fecha_fin         TIMESTAMP,
  fecha_trial_fin   TIMESTAMP,
  fecha_cancelacion TIMESTAMP,
  auto_renovar      BOOLEAN DEFAULT true,
  notas             TEXT,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suscripciones_empresa ON suscripciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_suscripciones_estado  ON suscripciones(estado);

-- 5. Agregar columna suscripcion_id a pagos
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS suscripcion_id INTEGER REFERENCES suscripciones(id);
