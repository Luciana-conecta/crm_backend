import { query } from '../config/database.js';
import WhatsAppService from '../service/whatsappService.js';

const whatsappWebhookController = {
  verificarWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log(' Webhook verificado');
      res.status(200).send(challenge);
    } else {
      console.log(' Verificación fallida');
      res.sendStatus(403);
    }
  },

  async recibirWebhook(req, res) {
    res.sendStatus(200);

    const body = req.body;


    if (body.object !== 'whatsapp_business_account') {
      return;
    }

    try {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            await whatsappWebhookController.procesarMensaje(change.value);
          } else if (change.field === 'message_status') {
            await whatsappWebhookController.procesarEstado(change.value);
          }
        }
      }
    } catch (error) {
      console.error(' Error procesando webhook:', error);
    }
  },

  async procesarMensaje(value) {
    try {
      const mensaje = value.messages?.[0];
      if (!mensaje) return;

      const contactoData = value.contacts?.[0];
      const metadata = value.metadata;

      console.log('\n' + '='.repeat(60));
      console.log('📱 MENSAJE ENTRANTE');
      console.log('De:', mensaje.from);
      console.log('Phone Number ID:', metadata.phone_number_id);
      console.log('='.repeat(60));

      const canalResult = await query(
        'SELECT * FROM canales WHERE phone_number_id = $1',
        [metadata.phone_number_id]
      );

      if (canalResult.rows.length === 0) {
        console.error('❌ Canal no encontrado para phone_number_id:', metadata.phone_number_id);
        return;
      }

      const canal = canalResult.rows[0];
      console.log('✅ Canal encontrado:', canal.nombre);

      let contacto = await query(
        'SELECT * FROM contactos WHERE numero_telefono = $1 AND empresa_id = $2',
        [mensaje.from, canal.empresa_id]
      );

      if (contacto.rows.length === 0) {
        const nombreContacto = contactoData?.profile?.name || mensaje.from;

        // Crear cliente en el CRM
        let cliente = await query(
          'SELECT id_cliente FROM clientes WHERE telefono = $1 AND id_empresa = $2',
          [mensaje.from, canal.empresa_id]
        );

        if (cliente.rows.length === 0) {
          cliente = await query(
            `INSERT INTO clientes (id_empresa, nombre, telefono, estado)
             VALUES ($1, $2, $3, 'activo')
             RETURNING id_cliente`,
            [canal.empresa_id, nombreContacto, mensaje.from]
          );
          console.log('✅ Cliente CRM creado:', cliente.rows[0].id_cliente);
        } else {
          console.log('✅ Cliente CRM encontrado:', cliente.rows[0].id_cliente);
        }

        contacto = await query(
          `INSERT INTO contactos
           (empresa_id, id_cliente, numero_telefono, nombre, plataforma, creado_en)
           VALUES ($1, $2, $3, $4, 'whatsapp', NOW())
           RETURNING *`,
          [canal.empresa_id, cliente.rows[0].id_cliente, mensaje.from, nombreContacto]
        );
        console.log('✅ Contacto creado:', contacto.rows[0].id_contactos);
      } else {
        console.log('✅ Contacto encontrado:', contacto.rows[0].id_contactos);
      }

      const contactoId = contacto.rows[0].id_contactos;
      let conversacion = await query(
        `SELECT * FROM conversaciones
         WHERE empresa_id = $1 AND contacto_id = $2 AND estado = 'abierta'
         ORDER BY creado_en DESC LIMIT 1`,
        [canal.empresa_id, contactoId]
      );

      if (conversacion.rows.length === 0) {
        conversacion = await query(
          `INSERT INTO conversaciones
           (empresa_id, contacto_id, plataforma, estado, ultimo_mensaje_en, creado_en)
           VALUES ($1, $2, 'whatsapp', 'abierta', NOW(), NOW())
           RETURNING *`,
          [canal.empresa_id, contactoId]
        );
        console.log('✅ Conversación creada:', conversacion.rows[0].conversaciones_id);
      } else {
        await query(
          'UPDATE conversaciones SET ultimo_mensaje_en = NOW() WHERE conversaciones_id = $1',
          [conversacion.rows[0].conversaciones_id]
        );
        console.log('✅ Conversación actualizada:', conversacion.rows[0].conversaciones_id);
      }

      const conversacionId = conversacion.rows[0].conversaciones_id;

      let contenido = '';
      let mediaUrl = null;

      switch (mensaje.type) {
        case 'text':
          contenido = mensaje.text.body;
          break;
        case 'image':
          contenido = mensaje.image.caption || '[Imagen]';
          mediaUrl = mensaje.image.id;
          break;
        case 'video':
          contenido = mensaje.video.caption || '[Video]';
          mediaUrl = mensaje.video.id;
          break;
        case 'audio':
          contenido = '[Audio]';
          mediaUrl = mensaje.audio.id;
          break;
        case 'document':
          contenido = mensaje.document.filename || '[Documento]';
          mediaUrl = mensaje.document.id;
          break;
        default:
          contenido = `[${mensaje.type}]`;
      }

      const nuevoMensaje = await query(
        `INSERT INTO mensajes
         (conversacion_id, empresa_id, plataforma_mensaje_id, direccion, contenido, tipo,
          media_url, estado, fecha_hora, creado_en)
         VALUES ($1, $2, $3, 'entrante', $4, $5, $6, 'recibido', $7, NOW())
         RETURNING *`,
        [
          conversacionId,
          canal.empresa_id,
          mensaje.id,
          contenido,
          mensaje.type,
          mediaUrl,
          new Date(parseInt(mensaje.timestamp) * 1000)
        ]
      );

      console.log('✅ Mensaje guardado:', nuevoMensaje.rows[0].mensaje_id);
      console.log('📝 Contenido:', contenido);
      console.log('='.repeat(60) + '\n');

      try {
        const whatsapp = new WhatsAppService(canal.phone_number_id, canal.access_token);
        await whatsapp.marcarComoLeido(mensaje.id);
      } catch (error) {
        console.log('⚠️ No se pudo marcar como leído:', error.message);
      }

    } catch (error) {
      console.error('❌ Error procesando mensaje:', error);
      console.error(error.stack);
    }
  },

  async procesarEstado(value) {
    try {
      const status = value.statuses?.[0];
      if (!status) return;

      console.log('📊 Estado actualizado:', status.id, '→', status.status);

      await query(
        `UPDATE mensajes
         SET estado = $1
         WHERE plataforma_mensaje_id = $2`,
        [status.status, status.id]
      );

      console.log('✅ Estado guardado en BD');

    } catch (error) {
      console.error('❌ Error procesando estado:', error);
    }
  }
};
export default whatsappWebhookController;
