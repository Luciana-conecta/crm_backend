import { query } from '../config/database.js';
import WhatsAppService from '../service/whatsappService.js';

export const canalController = {
  async crearCanal(req, res) {
    try {
      const { empresaId } = req.params;

      if (!empresaId || empresaId === 'undefined' || empresaId === 'null') {
        return res.status(400).json({ success: false, error: 'empresaId es requerido' });
      }

      const {
        nombre,
        phone_number_id,
        access_token,
        business_account_id,
        client_id,
        client_secret,
      } = req.body;

      // Verificar límite de canales del plan
      const planCheck = await query(
        `SELECT p.max_canales, COUNT(c.id) as current_canales
         FROM empresas e
         JOIN planes p ON e.plan_id = p.id
         LEFT JOIN canales c ON e.empresa_id = c.empresa_id
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

      const whatsappService = new WhatsAppService(phone_number_id, access_token, business_account_id);

      try {
        await whatsappService.obtenerInfoTelefono();
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Credenciales inválidas o teléfono no encontrado',
          details: error.message
        });
      }

      const configJson = JSON.stringify({ client_id: client_id || null, client_secret: client_secret || null });

      const result = await query(
        `INSERT INTO canales
         (empresa_id, nombre, tipo, phone_number_id, access_token,
          business_account_id, config, activo, created_at)
         VALUES ($1, $2, 'whatsapp', $3, $4, $5, $6::jsonb, true, NOW())
         RETURNING *`,
        [empresaId, nombre, phone_number_id, access_token, business_account_id, configJson]
      );

      res.json({
        success: true,
        canal: result.rows[0],
        message: 'Canal de WhatsApp creado exitosamente'
      });

    } catch (error) {
      console.error(' Error creando canal:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },


  async listarCanales(req, res) {
    try {
      const { empresaId } = req.params;

      if (!empresaId || empresaId === 'undefined' || empresaId === 'null') {
        return res.status(400).json({ success: false, error: 'empresaId es requerido' });
      }

      const result = await query(
        `SELECT * FROM canales 
         WHERE empresa_id = $1 
         ORDER BY created_at DESC`,
        [empresaId]
      );

      res.json({
        success: true,
        canales: result.rows
      });

    } catch (error) {
      console.error(' Error listando canales:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },


  async actualizarCanal(req, res) {
    try {
      const { canalId } = req.params;
      const { nombre, phone_number_id, access_token, business_account_id, client_id, client_secret } = req.body;

      const configPatch = JSON.stringify({
        ...(client_id     !== undefined && { client_id:     client_id     || null }),
        ...(client_secret !== undefined && { client_secret: client_secret || null }),
      });

      const result = await query(
        `UPDATE canales
         SET nombre              = COALESCE($1, nombre),
             phone_number_id     = COALESCE($2, phone_number_id),
             access_token        = COALESCE($3, access_token),
             business_account_id = COALESCE($4, business_account_id),
             config              = COALESCE(config, '{}'::jsonb) || $5::jsonb,
             updated_at          = NOW()
         WHERE id = $6
         RETURNING *`,
        [nombre, phone_number_id, access_token, business_account_id, configPatch, canalId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Canal no encontrado' });
      }

      res.json({ success: true, canal: result.rows[0], message: 'Canal actualizado exitosamente' });
    } catch (error) {
      console.error(' Error actualizando canal:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async eliminarCanal(req, res) {
    try {
      const { canalId } = req.params;

      const result = await query(
        'DELETE FROM canales WHERE id = $1 RETURNING id',
        [canalId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Canal no encontrado' });
      }

      res.json({ success: true, message: 'Canal eliminado exitosamente' });
    } catch (error) {
      console.error(' Error eliminando canal:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  async probarCanal(req, res) {
    try {
      const { canalId } = req.params;

      const result = await query(
        'SELECT * FROM canales WHERE id = $1',
        [canalId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Canal no encontrado'
        });
      }

      const canal = result.rows[0];
      const whatsappService = new WhatsAppService(
        canal.phone_number_id,
        canal.access_token,
        canal.business_account_id
      );

      const info = await whatsappService.obtenerInfoTelefono();
      const perfil = await whatsappService.obtenerPerfilNegocio();

      res.json({
        success: true,
        message: 'Canal funcionando correctamente',
        phone_info: info,
        business_profile: perfil
      });

    } catch (error) {
      console.error(' Error probando canal:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};