import { query } from '../config/database.js';

// ─── Helper ─────────────────────────────────────────────────────────────────

/**
 * Aplica lazy-update de estado si la suscripción expiró.
 * Retorna el estado efectivo (puede diferir del almacenado).
 */
const resolverEstado = async (sub) => {
  if (sub.estado === 'cancelada' || sub.estado === 'suspendida') return sub.estado;

  const now = new Date();

  if (sub.estado === 'trial' && sub.fecha_trial_fin && now > new Date(sub.fecha_trial_fin)) {
    await query(
      `UPDATE suscripciones SET estado = 'vencida', updated_at = NOW() WHERE id = $1`,
      [sub.id]
    );
    return 'vencida';
  }

  if (sub.estado === 'activa' && sub.fecha_fin && now > new Date(sub.fecha_fin)) {
    await query(
      `UPDATE suscripciones SET estado = 'vencida', updated_at = NOW() WHERE id = $1`,
      [sub.id]
    );
    return 'vencida';
  }

  return sub.estado;
};

const SUB_SELECT = `
  SELECT
    s.*,
    e.nombre  AS empresa_nombre,
    p.nombre  AS plan_nombre,
    p.precio  AS plan_precio,
    p.max_usuarios,
    p.max_clientes,
    p.max_canales,
    p.caracteristicas AS plan_caracteristicas
  FROM suscripciones s
  JOIN empresas  e ON s.empresa_id = e.empresa_id
  JOIN planes    p ON s.plan_id    = p.id
`;

// ─── Super Admin ─────────────────────────────────────────────────────────────

const getSuscripciones = async (req, res) => {
  const { estado, empresa_id } = req.query;
  const params = [];
  const conditions = [];

  if (estado)     conditions.push(`s.estado = $${params.push(estado)}`);
  if (empresa_id) conditions.push(`s.empresa_id = $${params.push(empresa_id)}`);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `${SUB_SELECT} ${where} ORDER BY s.created_at DESC`,
    params
  );

  res.json({ success: true, data: result.rows });
};

const getSuscripcionById = async (req, res) => {
  const { id } = req.params;

  const result = await query(`${SUB_SELECT} WHERE s.id = $1`, [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Suscripción no encontrada' });
  }

  const sub = result.rows[0];
  sub.estado = await resolverEstado(sub);

  res.json({ success: true, data: sub });
};

const createSuscripcion = async (req, res) => {
  const {
    empresa_id, plan_id, estado, fecha_inicio,
    fecha_fin, notas, auto_renovar
  } = req.body;

  if (!empresa_id || !plan_id) {
    return res.status(400).json({ success: false, error: 'empresa_id y plan_id son requeridos' });
  }

  // Calcular fecha_trial_fin según el plan
  const planResult = await query('SELECT trial_dias FROM planes WHERE id = $1', [plan_id]);
  if (planResult.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Plan no encontrado' });
  }

  const { trial_dias } = planResult.rows[0];
  const estadoFinal = estado || (trial_dias > 0 ? 'trial' : 'activa');

  let fecha_trial_fin = null;
  if (estadoFinal === 'trial' && trial_dias > 0) {
    const ft = new Date(fecha_inicio || Date.now());
    ft.setDate(ft.getDate() + trial_dias);
    fecha_trial_fin = ft.toISOString();
  }

  const result = await query(
    `INSERT INTO suscripciones
       (empresa_id, plan_id, estado, fecha_inicio, fecha_fin, fecha_trial_fin, auto_renovar, notas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      empresa_id, plan_id, estadoFinal,
      fecha_inicio || new Date().toISOString(),
      fecha_fin || null,
      fecha_trial_fin,
      auto_renovar !== undefined ? auto_renovar : true,
      notas || null
    ]
  );

  res.status(201).json({ success: true, data: result.rows[0] });
};

const updateSuscripcion = async (req, res) => {
  const { id } = req.params;
  const {
    plan_id, estado, fecha_fin, fecha_trial_fin,
    auto_renovar, notas
  } = req.body;

  // Si se cancela, registrar fecha
  const fecha_cancelacion = estado === 'cancelada' ? new Date().toISOString() : undefined;

  const result = await query(
    `UPDATE suscripciones
     SET plan_id           = COALESCE($1, plan_id),
         estado            = COALESCE($2, estado),
         fecha_fin         = COALESCE($3, fecha_fin),
         fecha_trial_fin   = COALESCE($4, fecha_trial_fin),
         fecha_cancelacion = COALESCE($5, fecha_cancelacion),
         auto_renovar      = COALESCE($6, auto_renovar),
         notas             = COALESCE($7, notas),
         updated_at        = NOW()
     WHERE id = $8
     RETURNING *`,
    [
      plan_id || null,
      estado || null,
      fecha_fin || null,
      fecha_trial_fin || null,
      fecha_cancelacion || null,
      auto_renovar !== undefined ? auto_renovar : null,
      notas || null,
      id
    ]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Suscripción no encontrada' });
  }

  res.json({ success: true, data: result.rows[0] });
};

const getSuscripcionByEmpresa = async (req, res) => {
  const { id } = req.params; // empresa id

  const result = await query(
    `${SUB_SELECT}
     WHERE s.empresa_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'No se encontró suscripción para esta empresa' });
  }

  const sub = result.rows[0];
  sub.estado = await resolverEstado(sub);

  res.json({ success: true, data: sub });
};

// ─── Self-service empresa ─────────────────────────────────────────────────────

const getMiSuscripcion = async (req, res) => {
  const empresaId = req.user.empresa_id;

  if (!empresaId) {
    return res.status(400).json({ success: false, error: 'Usuario no tiene empresa asociada' });
  }

  const result = await query(
    `${SUB_SELECT}
     WHERE s.empresa_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [empresaId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'No se encontró suscripción activa' });
  }

  const sub = result.rows[0];
  sub.estado = await resolverEstado(sub);

  // Días restantes de trial
  let dias_trial_restantes = null;
  if (sub.estado === 'trial' && sub.fecha_trial_fin) {
    const diff = new Date(sub.fecha_trial_fin) - new Date();
    dias_trial_restantes = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  res.json({ success: true, data: { ...sub, dias_trial_restantes } });
};

const getHistorialPagos = async (req, res) => {
  const empresaId = req.user.empresa_id;

  if (!empresaId) {
    return res.status(400).json({ success: false, error: 'Usuario no tiene empresa asociada' });
  }

  const result = await query(
    `SELECT p.*, pl.nombre AS plan_nombre
     FROM pagos p
     LEFT JOIN planes pl ON p.plan_id = pl.id
     WHERE p.empresa_id = $1
     ORDER BY p.created_at DESC`,
    [empresaId]
  );

  res.json({ success: true, data: result.rows });
};

export default {
  getSuscripciones,
  getSuscripcionById,
  createSuscripcion,
  updateSuscripcion,
  getSuscripcionByEmpresa,
  getMiSuscripcion,
  getHistorialPagos,
};
