import { query } from '../config/database.js';
import WhatsAppService from '../service/whatsappService.js';

export const inboxController = {
  async obtenerConversaciones(req, res) {
    try {
      const { empresaId } = req.params;
      const { estado, asignado_a, busqueda } = req.query;

      // Solo validar si el JWT trae empresa_id (tokens viejos no lo traen)
      if (req.user.empresa_id && parseInt(req.user.empresa_id) !== parseInt(empresaId)) {
        return res.status(403).json({ error: 'Acceso denegado' });
      }

      let sql = `
        SELECT
          c.conversaciones_id as id,
          cnt.numero_telefono as telefono_whatsapp,
          c.estado,
          c.ultimo_mensaje_en,
          c.asignado_a,
          cnt.nombre as contacto_nombre,
          cnt.foto_perfil_url as foto_perfil,
          (
            SELECT contenido
            FROM mensajes
            WHERE conversacion_id = c.conversaciones_id
            ORDER BY fecha_hora DESC
            LIMIT 1
          ) as ultimo_mensaje,
          (
            SELECT COUNT(*)
            FROM mensajes
            WHERE conversacion_id = c.conversaciones_id
              AND direccion = 'entrante'
              AND estado != 'read'
          )::integer as mensajes_no_leidos
        FROM conversaciones c
        LEFT JOIN contactos cnt ON c.contacto_id = cnt.id_contactos
        WHERE c.empresa_id = $1
      `;

      const params = [empresaId];
      let paramIndex = 2;

      if (estado) {
        sql += ` AND c.estado = $${paramIndex}`;
        params.push(estado);
        paramIndex++;
      }

      if (asignado_a) {
        sql += ` AND c.asignado_a = $${paramIndex}`;
        params.push(asignado_a);
        paramIndex++;
      }

      if (busqueda) {
        sql += ` AND (
          cnt.nombre ILIKE $${paramIndex} OR
          cnt.numero_telefono ILIKE $${paramIndex}
        )`;
        params.push(`%${busqueda}%`);
        paramIndex++;
      }

      sql += ' ORDER BY c.ultimo_mensaje_en DESC';

      const result = await query(sql, params);

      res.json({
        conversaciones: result.rows,
        total: result.rows.length
      });

    } catch (error) {
      console.error(' Error obteniendo conversaciones:', error);
      res.status(500).json({ error: 'Error obteniendo conversaciones' });
    }
  },
  async obtenerMensajes(req, res) {
    try {
      const { conversacionId } = req.params;
      const empresaId = req.user.empresa_id;

      const conversacion = await query(
        `SELECT * FROM conversaciones
         WHERE conversaciones_id = $1 AND empresa_id = $2`,
        [conversacionId, empresaId]
      );

      if (conversacion.rows.length === 0) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }

      const mensajes = await query(
        `SELECT
          mensaje_id as id,
          conversacion_id,
          plataforma_mensaje_id,
          direccion,
          contenido,
          tipo,
          media_url,
          estado,
          fecha_hora as timestamp,
          creado_en
        FROM mensajes
        WHERE conversacion_id = $1
        ORDER BY fecha_hora ASC`,
        [conversacionId]
      );

      res.json({
        mensajes: mensajes.rows,
        total: mensajes.rows.length
      });

    } catch (error) {
      console.error(' Error obteniendo mensajes:', error);
      res.status(500).json({ error: 'Error obteniendo mensajes' });
    }
  },

  async enviarMensaje(req, res) {
    try {
      const { conversacionId, contenido, tipo = 'text' } = req.body;
      const empresaId = req.user.empresa_id;

      if (!conversacionId || !contenido) {
        return res.status(400).json({ error: 'Faltan datos requeridos' });
      }

      const conversacion = await query(
        `SELECT c.*, cnt.numero_telefono, ch.phone_number_id, ch.access_token, ch.business_account_id
         FROM conversaciones c
         LEFT JOIN contactos cnt ON c.contacto_id = cnt.id_contactos
         JOIN canales ch ON ch.empresa_id = c.empresa_id AND ch.tipo = 'whatsapp' AND ch.activo = true
         WHERE c.conversaciones_id = $1 AND c.empresa_id = $2
         LIMIT 1`,
        [conversacionId, empresaId]
      );

      if (conversacion.rows.length === 0) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }

      const conv = conversacion.rows[0];

      if (!conv.phone_number_id || !conv.access_token) {
        return res.status(400).json({ error: 'No hay canal de WhatsApp activo configurado para esta empresa.' });
      }

      const whatsapp = new WhatsAppService(
        conv.phone_number_id,
        conv.access_token,
        conv.business_account_id
      );

      const response = await whatsapp.enviarMensajeTexto(
        conv.numero_telefono,
        contenido
      );


      const nuevoMensaje = await query(
        `INSERT INTO mensajes
         (conversacion_id, empresa_id, plataforma_mensaje_id, direccion, contenido, tipo, estado, fecha_hora, creado_en)
         VALUES ($1, $2, $3, 'saliente', $4, $5, 'sent', NOW(), NOW())
         RETURNING *`,
        [conversacionId, empresaId, response.messages[0].id, contenido, tipo]
      );

      await query(
        `UPDATE conversaciones
         SET ultimo_mensaje_en = NOW()
         WHERE conversaciones_id = $1`,
        [conversacionId]
      );

      res.json({
        success: true,
        mensaje: nuevoMensaje.rows[0],
        whatsapp_message_id: response.messages[0].id
      });

    } catch (error) {
      console.error(' Error enviando mensaje:', error);
      res.status(500).json({
        error: 'Error enviando mensaje',
        details: error.message
      });
    }
  },

  async actualizarEstado(req, res) {
    try {
      const { conversacionId } = req.params;
      const { estado } = req.body;
      const empresaId = req.user.empresa_id;

      if (!estado) {
        return res.status(400).json({ error: 'Estado requerido' });
      }

      const check = await query(
        `SELECT conversaciones_id FROM conversaciones
         WHERE conversaciones_id = $1 AND empresa_id = $2`,
        [conversacionId, empresaId]
      );

      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }

      const result = await query(
        `UPDATE conversaciones
         SET estado = $1, actualizado_en = NOW()
         WHERE conversaciones_id = $2
         RETURNING *`,
        [estado, conversacionId]
      );

      res.json({
        success: true,
        conversacion: result.rows[0]
      });

    } catch (error) {
      console.error(' Error actualizando conversación:', error);
      res.status(500).json({ error: 'Error actualizando conversación' });
    }
  },

  async marcarComoLeido(req, res) {
    try {
      const { conversacionId } = req.params;
      const empresaId = req.user.empresa_id;

      const check = await query(
        `SELECT conversaciones_id FROM conversaciones
         WHERE conversaciones_id = $1 AND empresa_id = $2`,
        [conversacionId, empresaId]
      );

      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }

      await query(
        `UPDATE mensajes
         SET estado = 'read'
         WHERE conversacion_id = $1
           AND direccion = 'entrante'
           AND estado != 'read'`,
        [conversacionId]
      );

      res.json({ success: true });

    } catch (error) {
      console.error(' Error marcando como leído:', error);
      res.status(500).json({ error: 'Error marcando como leído' });
    }
  }
};
