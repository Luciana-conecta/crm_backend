import { query } from '../config/database.js';

/**
 * Verifica que la empresa del usuario tenga una suscripción vigente.
 * - super_admin: siempre pasa
 * - admin_empresa / usuario_empresa: verifica estado de suscripción
 *
 * Adjunta `req.subscription` con los datos de la suscripción activa.
 */
export const checkSubscription = async (req, res, next) => {
  if (req.user?.tipo_usuario === 'super_admin') return next();

  const empresaId = req.user?.empresa_id;
  if (!empresaId) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Usuario no tiene empresa asociada'
    });
  }

  try {
    const result = await query(
      `SELECT s.*, p.trial_dias
       FROM suscripciones s
       JOIN planes p ON s.plan_id = p.id
       WHERE s.empresa_id = $1
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [empresaId]
    );

    if (result.rows.length === 0) {
      // Auto-crear suscripción trial si la empresa tiene plan asignado
      const empresaResult = await query(
        `SELECT e.plan_id, p.trial_dias
         FROM empresas e
         JOIN planes p ON e.plan_id = p.id
         WHERE e.empresa_id = $1`,
        [empresaId]
      );

      if (empresaResult.rows.length === 0 || !empresaResult.rows[0].plan_id) {
        return res.status(403).json({
          error: 'SubscriptionRequired',
          message: 'Tu empresa no tiene un plan asignado. Contacta al administrador.'
        });
      }

      const { plan_id, trial_dias } = empresaResult.rows[0];
      const estadoInicial = trial_dias > 0 ? 'trial' : 'activa';
      let fecha_trial_fin = null;
      if (estadoInicial === 'trial') {
        const ft = new Date();
        ft.setDate(ft.getDate() + trial_dias);
        fecha_trial_fin = ft.toISOString();
      }

      const newSub = await query(
        `INSERT INTO suscripciones (empresa_id, plan_id, estado, fecha_inicio, fecha_trial_fin)
         VALUES ($1, $2, $3, NOW(), $4)
         RETURNING *, $5::integer AS trial_dias`,
        [empresaId, plan_id, estadoInicial, fecha_trial_fin, trial_dias]
      );

      console.log(`[SUBSCRIPTION] Suscripción auto-creada (${estadoInicial}) para empresa ID: ${empresaId}`);
      req.subscription = newSub.rows[0];
      return next();
    }

    const sub = result.rows[0];
    const now = new Date();

    // Lazy-update: verificar si expiró
    if (sub.estado === 'trial' && sub.fecha_trial_fin && now > new Date(sub.fecha_trial_fin)) {
      await query(
        `UPDATE suscripciones SET estado = 'vencida', updated_at = NOW() WHERE id = $1`,
        [sub.id]
      );
      sub.estado = 'vencida';
    } else if (sub.estado === 'activa' && sub.fecha_fin && now > new Date(sub.fecha_fin)) {
      await query(
        `UPDATE suscripciones SET estado = 'vencida', updated_at = NOW() WHERE id = $1`,
        [sub.id]
      );
      sub.estado = 'vencida';
    }

    if (sub.estado === 'vencida') {
      return res.status(403).json({
        error: 'SubscriptionExpired',
        message: 'Tu suscripción ha vencido. Renueva tu plan para continuar usando el servicio.'
      });
    }

    if (sub.estado === 'cancelada') {
      return res.status(403).json({
        error: 'SubscriptionCancelled',
        message: 'Tu suscripción ha sido cancelada. Contacta al administrador para reactivarla.'
      });
    }

    if (sub.estado === 'suspendida') {
      return res.status(403).json({
        error: 'SubscriptionSuspended',
        message: 'Tu suscripción está suspendida. Contacta al administrador.'
      });
    }

    req.subscription = sub;
    next();
  } catch (error) {
    console.error('[SUBSCRIPTION] Error al verificar suscripción:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al verificar el estado de la suscripción'
    });
  }
};
