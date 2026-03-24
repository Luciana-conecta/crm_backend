import { query } from '../config/database.js';

const PLATAFORMAS_VALIDAS = ['instagram', 'facebook', 'tiktok', 'twitter', 'linkedin', 'telegram'];

export const socialController = {

  async listarCanales(req, res) {
    try {
      const { empresaId } = req.params;

      const result = await query(
        `SELECT * FROM canales_sociales
         WHERE empresa_id = $1
         ORDER BY created_at DESC`,
        [empresaId]
      );

      res.json({ success: true, canales: result.rows });
    } catch (error) {
      console.error('[SOCIAL] Error listando canales:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async crearCanal(req, res) {
    try {
      const { empresaId } = req.params;
      const { plataforma, nombre, page_id, access_token, username, page_url } = req.body;

      if (!plataforma) {
        return res.status(400).json({ success: false, error: 'plataforma es requerida' });
      }

      if (!PLATAFORMAS_VALIDAS.includes(plataforma)) {
        return res.status(400).json({
          success: false,
          error: `Plataforma inválida. Válidas: ${PLATAFORMAS_VALIDAS.join(', ')}`
        });
      }

      // Verificar límite de canales del plan
      const planCheck = await query(
        `SELECT p.max_canales,
                COUNT(cs.id) AS current_canales
         FROM empresas e
         JOIN planes p ON e.plan_id = p.id
         LEFT JOIN canales_sociales cs ON e.empresa_id = cs.empresa_id AND cs.activo = true
         WHERE e.empresa_id = $1
         GROUP BY p.max_canales`,
        [empresaId]
      );

      if (planCheck.rows.length > 0) {
        const { max_canales, current_canales } = planCheck.rows[0];
        if (max_canales && parseInt(current_canales) >= parseInt(max_canales)) {
          return res.status(403).json({
            success: false,
            error: `Tu plan permite máximo ${max_canales} canal(es). Actualiza tu plan para agregar más.`
          });
        }
      }

      const result = await query(
        `INSERT INTO canales_sociales
           (empresa_id, plataforma, nombre, page_id, access_token, username, page_url, activo, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
         RETURNING *`,
        [empresaId, plataforma, nombre || null, page_id || null, access_token || null, username || null, page_url || null]
      );

      console.log(`[SOCIAL] Canal ${plataforma} creado para empresa ${empresaId}`);
      res.status(201).json({
        success: true,
        canal: result.rows[0],
        message: `Canal de ${plataforma} creado exitosamente`
      });
    } catch (error) {
      console.error('[SOCIAL] Error creando canal:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async actualizarCanal(req, res) {
    try {
      const { canalId } = req.params;
      const { nombre, page_id, access_token, username, page_url, activo } = req.body;

      const result = await query(
        `UPDATE canales_sociales
         SET nombre       = COALESCE($1, nombre),
             page_id      = COALESCE($2, page_id),
             access_token = COALESCE($3, access_token),
             username     = COALESCE($4, username),
             page_url     = COALESCE($5, page_url),
             activo       = COALESCE($6, activo),
             updated_at   = NOW()
         WHERE id = $7
         RETURNING *`,
        [nombre, page_id, access_token, username, page_url, activo, canalId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Canal no encontrado' });
      }

      res.json({ success: true, canal: result.rows[0], message: 'Canal actualizado exitosamente' });
    } catch (error) {
      console.error('[SOCIAL] Error actualizando canal:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async eliminarCanal(req, res) {
    try {
      const { canalId } = req.params;

      const result = await query(
        'DELETE FROM canales_sociales WHERE id = $1 RETURNING id',
        [canalId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Canal no encontrado' });
      }

      res.json({ success: true, message: 'Canal eliminado exitosamente' });
    } catch (error) {
      console.error('[SOCIAL] Error eliminando canal:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async toggleActivo(req, res) {
    try {
      const { canalId } = req.params;

      const result = await query(
        `UPDATE canales_sociales
         SET activo = NOT activo, updated_at = NOW()
         WHERE id = $1
         RETURNING id, plataforma, nombre, activo`,
        [canalId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Canal no encontrado' });
      }

      const { activo, plataforma } = result.rows[0];
      res.json({
        success: true,
        canal: result.rows[0],
        message: `Canal ${plataforma} ${activo ? 'activado' : 'desactivado'}`
      });
    } catch (error) {
      console.error('[SOCIAL] Error toggling canal:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
};
