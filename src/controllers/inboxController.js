import fs from 'node:fs';
import multer from 'multer';
import { query } from '../config/database.js';
import WhatsAppService from '../service/whatsappService.js';
import * as baileysService from '../service/baileysService.js';
import { notificarNuevoMensaje } from '../service/websocketService.js';
import { guardarMedia, rutaMedia } from '../service/mediaService.js';

// Documentos (PDF, Word, Excel, etc.) que se pueden compartir por WhatsApp desde el CRM.
export const uploadArchivo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
}).single('archivo');

// Si respondimos (saliente) y el cliente no volvió a escribir en este lapso,
// la conversación pasa de "abierta" a "sin_respuesta" (se persiste, no es solo de pantalla,
// para que el pipeline se pueda editar a mano arrastrando/moviendo tarjetas).
const HORAS_SIN_RESPUESTA = 24;

// El token de super_admin no lleva empresa_id (ver authController.login), así que
// filtrar por req.user.empresa_id dejaba 404 toda conversación abierta desde el panel admin.
// null = sin restricción de empresa; -1 = token sin empresa_id (no coincide con ninguna).
function empresaDelToken(req) {
  if (req.user.tipo_usuario === 'super_admin') return null;
  return req.user.empresa_id ?? -1;
}

async function promoverConversacionesFrias(empresaId) {
  await query(
    `UPDATE conversaciones c
     SET estado = 'sin_respuesta'
     WHERE c.empresa_id = $1
       AND c.estado = 'abierta'
       AND c.ultimo_mensaje_en < NOW() - INTERVAL '${HORAS_SIN_RESPUESTA} hours'
       AND (
         SELECT direccion FROM mensajes
         WHERE conversacion_id = c.conversaciones_id
         ORDER BY fecha_hora DESC LIMIT 1
       ) = 'saliente'`,
    [empresaId]
  );
}

export const inboxController = {
  async obtenerConversaciones(req, res) {
    try {
      const { empresaId } = req.params;
      const { estado, asignado_a, busqueda } = req.query;

      // Solo validar si el JWT trae empresa_id (tokens viejos no lo traen)
      if (req.user.empresa_id && parseInt(req.user.empresa_id) !== parseInt(empresaId)) {
        return res.status(403).json({ error: 'Acceso denegado' });
      }

      await promoverConversacionesFrias(empresaId).catch((err) =>
        console.error('Error promoviendo conversaciones frías:', err.message)
      );

      let sql = `
        SELECT
          c.conversaciones_id as id,
          cnt.numero_telefono as telefono_whatsapp,
          c.estado,
          c.ultimo_mensaje_en,
          c.asignado_a,
          c.asignado_a_humano,
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
          )::integer as mensajes_no_leidos,
          (
            SELECT direccion
            FROM mensajes
            WHERE conversacion_id = c.conversaciones_id
            ORDER BY fecha_hora DESC
            LIMIT 1
          ) as ultima_direccion
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
      const conversaciones = result.rows.map((conv) => ({
        ...conv,
        pipeline_status: conv.estado,
      }));

      res.json({
        conversaciones,
        total: conversaciones.length
      });

    } catch (error) {
      console.error(' Error obteniendo conversaciones:', error);
      res.status(500).json({ error: 'Error obteniendo conversaciones' });
    }
  },
  async obtenerMensajes(req, res) {
    try {
      const { conversacionId } = req.params;
      const empresaId = empresaDelToken(req);

      const conversacion = await query(
        `SELECT * FROM conversaciones
         WHERE conversaciones_id = $1
           AND ($2::int IS NULL OR empresa_id = $2)`,
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
      const empresaId = empresaDelToken(req);

      if (!conversacionId || !contenido) {
        return res.status(400).json({ error: 'Faltan datos requeridos' });
      }

      const conversacion = await query(
        `SELECT c.*, cnt.numero_telefono, ch.id as canal_id, ch.metodo_conexion,
                ch.phone_number_id, ch.access_token, ch.business_account_id
         FROM conversaciones c
         LEFT JOIN contactos cnt ON c.contacto_id = cnt.id_contactos
         JOIN canales ch ON ch.empresa_id = c.empresa_id AND ch.tipo = 'whatsapp' AND ch.activo = true
         WHERE c.conversaciones_id = $1
           AND ($2::int IS NULL OR c.empresa_id = $2)
         LIMIT 1`,
        [conversacionId, empresaId]
      );

      if (conversacion.rows.length === 0) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }

      const conv = conversacion.rows[0];
      let whatsappMessageId;

      if (conv.metodo_conexion === 'qr') {
        const result = await baileysService.enviarMensaje(conv.canal_id, conv.numero_telefono, contenido);
        whatsappMessageId = result?.key?.id || `qr_${Date.now()}`;
      } else {
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
        whatsappMessageId = response.messages[0].id;
      }

      const nuevoMensaje = await query(
        `INSERT INTO mensajes
         (conversacion_id, empresa_id, plataforma_mensaje_id, direccion, contenido, tipo, estado, fecha_hora, creado_en)
         VALUES ($1, $2, $3, 'saliente', $4, $5, 'sent', NOW(), NOW())
         RETURNING *`,
        [conversacionId, conv.empresa_id, whatsappMessageId, contenido, tipo]
      );

      await query(
        `UPDATE conversaciones
         SET ultimo_mensaje_en = NOW(),
             asignado_a_humano = true
         WHERE conversaciones_id = $1`,
        [conversacionId]
      );

      notificarNuevoMensaje(conv.empresa_id, {
        conversacionId,
        mensaje: {
          id: nuevoMensaje.rows[0].mensaje_id,
          conversacion_id: nuevoMensaje.rows[0].conversacion_id,
          plataforma_mensaje_id: nuevoMensaje.rows[0].plataforma_mensaje_id,
          direccion: nuevoMensaje.rows[0].direccion,
          contenido: nuevoMensaje.rows[0].contenido,
          tipo: nuevoMensaje.rows[0].tipo,
          media_url: nuevoMensaje.rows[0].media_url,
          estado: nuevoMensaje.rows[0].estado,
          timestamp: nuevoMensaje.rows[0].fecha_hora,
          creado_en: nuevoMensaje.rows[0].creado_en,
        },
      });

      res.json({
        success: true,
        mensaje: nuevoMensaje.rows[0],
        whatsapp_message_id: whatsappMessageId
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
      const empresaId = empresaDelToken(req);

      if (!estado) {
        return res.status(400).json({ error: 'Estado requerido' });
      }

      const check = await query(
        `SELECT conversaciones_id FROM conversaciones
         WHERE conversaciones_id = $1
           AND ($2::int IS NULL OR empresa_id = $2)`,
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
      const empresaId = empresaDelToken(req);

      const check = await query(
        `SELECT conversaciones_id FROM conversaciones
         WHERE conversaciones_id = $1
           AND ($2::int IS NULL OR empresa_id = $2)`,
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
  },

  async obtenerMedia(req, res) {
    try {
      const { empresaId, filename } = req.params;
      const tokenEmpresa = empresaDelToken(req);

      if (tokenEmpresa !== null && parseInt(tokenEmpresa) !== parseInt(empresaId)) {
        return res.status(403).json({ error: 'Acceso denegado' });
      }

      const filePath = rutaMedia(empresaId, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
      }

      res.sendFile(filePath);

    } catch (error) {
      console.error(' Error sirviendo media:', error);
      res.status(500).json({ error: 'Error sirviendo media' });
    }
  },

  // Sin authenticateToken a propósito: los servidores de Meta necesitan bajar el
  // documento por esta URL para poder reenviarlo al destinatario, y no mandan un
  // Bearer token del CRM. La única protección es que el nombre de archivo es un
  // UUID random (mismo esquema que /media/:empresaId/:filename).
  async obtenerMediaPublico(req, res) {
    try {
      const { empresaId, filename } = req.params;

      const filePath = rutaMedia(empresaId, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
      }

      res.sendFile(filePath);

    } catch (error) {
      console.error(' Error sirviendo media público:', error);
      res.status(500).json({ error: 'Error sirviendo media' });
    }
  },

  async enviarArchivo(req, res) {
    try {
      const { conversacionId } = req.params;
      const { caption = '' } = req.body;
      const empresaId = empresaDelToken(req);

      if (!req.file) {
        return res.status(400).json({ error: 'Falta el archivo (campo "archivo")' });
      }

      const conversacion = await query(
        `SELECT c.*, cnt.numero_telefono, ch.id as canal_id, ch.metodo_conexion,
                ch.phone_number_id, ch.access_token, ch.business_account_id
         FROM conversaciones c
         LEFT JOIN contactos cnt ON c.contacto_id = cnt.id_contactos
         JOIN canales ch ON ch.empresa_id = c.empresa_id AND ch.tipo = 'whatsapp' AND ch.activo = true
         WHERE c.conversaciones_id = $1
           AND ($2::int IS NULL OR c.empresa_id = $2)
         LIMIT 1`,
        [conversacionId, empresaId]
      );

      if (conversacion.rows.length === 0) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }

      const conv = conversacion.rows[0];
      const filename = req.file.originalname;
      const mediaUrl = guardarMedia(conv.empresa_id, req.file.buffer, req.file.mimetype, filename);

      let whatsappMessageId;

      if (conv.metodo_conexion === 'qr') {
        const result = await baileysService.enviarArchivo(
          conv.canal_id,
          conv.numero_telefono,
          req.file.buffer,
          filename,
          req.file.mimetype,
          caption
        );
        whatsappMessageId = result?.key?.id || `qr_${Date.now()}`;
      } else {
        if (!conv.phone_number_id || !conv.access_token) {
          return res.status(400).json({ error: 'No hay canal de WhatsApp activo configurado para esta empresa.' });
        }

        const whatsapp = new WhatsAppService(conv.phone_number_id, conv.access_token, conv.business_account_id);
        const urlPublica = `${req.protocol}://${req.get('host')}${mediaUrl.replace('/media/', '/media-publico/')}`;

        const response = await whatsapp.enviarDocumento(conv.numero_telefono, urlPublica, filename, caption);
        whatsappMessageId = response.messages[0].id;
      }

      const nuevoMensaje = await query(
        `INSERT INTO mensajes
         (conversacion_id, empresa_id, plataforma_mensaje_id, direccion, contenido, tipo, media_url, estado, fecha_hora, creado_en)
         VALUES ($1, $2, $3, 'saliente', $4, 'document', $5, 'sent', NOW(), NOW())
         RETURNING *`,
        [conversacionId, conv.empresa_id, whatsappMessageId, caption || filename, mediaUrl]
      );

      await query(
        `UPDATE conversaciones
         SET ultimo_mensaje_en = NOW(),
             asignado_a_humano = true
         WHERE conversaciones_id = $1`,
        [conversacionId]
      );

      notificarNuevoMensaje(conv.empresa_id, {
        conversacionId,
        mensaje: {
          id: nuevoMensaje.rows[0].mensaje_id,
          conversacion_id: nuevoMensaje.rows[0].conversacion_id,
          plataforma_mensaje_id: nuevoMensaje.rows[0].plataforma_mensaje_id,
          direccion: nuevoMensaje.rows[0].direccion,
          contenido: nuevoMensaje.rows[0].contenido,
          tipo: nuevoMensaje.rows[0].tipo,
          media_url: nuevoMensaje.rows[0].media_url,
          estado: nuevoMensaje.rows[0].estado,
          timestamp: nuevoMensaje.rows[0].fecha_hora,
          creado_en: nuevoMensaje.rows[0].creado_en,
        },
      });

      res.json({
        success: true,
        mensaje: nuevoMensaje.rows[0],
        whatsapp_message_id: whatsappMessageId
      });

    } catch (error) {
      console.error(' Error enviando archivo:', error);
      res.status(500).json({
        error: 'Error enviando archivo',
        details: error.message
      });
    }
  }
};
