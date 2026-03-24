-- ============================================================
-- Migration 002: Backfill de suscripciones para empresas existentes
-- Crea una suscripción de prueba para cada empresa que no tenga una
-- ============================================================

-- Dar 14 días de trial a todos los planes (ajusta si necesitas otro valor)
UPDATE planes SET trial_dias = 14 WHERE trial_dias = 0;

-- Crear suscripción trial para empresas sin suscripción
INSERT INTO suscripciones (empresa_id, plan_id, estado, fecha_inicio, fecha_trial_fin)
SELECT
  e.empresa_id,
  e.plan_id,
  CASE WHEN p.trial_dias > 0 THEN 'trial' ELSE 'activa' END,
  NOW(),
  CASE WHEN p.trial_dias > 0 THEN NOW() + (p.trial_dias || ' days')::INTERVAL ELSE NULL END
FROM empresas e
JOIN planes p ON e.plan_id = p.id
WHERE e.empresa_id NOT IN (SELECT DISTINCT empresa_id FROM suscripciones)
  AND e.plan_id IS NOT NULL;

-- Verificar resultado
SELECT
  e.nombre AS empresa,
  p.nombre AS plan,
  s.estado,
  s.fecha_trial_fin
FROM suscripciones s
JOIN empresas e ON s.empresa_id = e.empresa_id
JOIN planes   p ON s.plan_id    = p.id
ORDER BY s.created_at DESC;
