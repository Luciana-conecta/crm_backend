import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'node:path';
import fs from 'node:fs';
import QRCode from 'qrcode';
import { query } from '../config/database.js';
import { notificarNuevoMensaje } from './websocketService.js';
import { generarRespuestaIA } from './iaService.js';
import { guardarMedia } from './mediaService.js';

const AUTH_BASE = path.resolve(process.cwd(), 'whatsapp_sessions');
const logger = pino({ level: 'silent' });

// canalId -> { sock, status, qrString, phone, empresaId }
const sesiones = new Map();

function authDir(canalId) {
  return path.join(AUTH_BASE, `canal_${canalId}`);
}

async function actualizarCanalDb(canalId, { qr_status, qr_phone, activo }) {
  const sets = [];
  const params = [];
  let i = 1;

  if (qr_status !== undefined) { sets.push(`qr_status = $${i++}`); params.push(qr_status); }
  if (qr_phone !== undefined) { sets.push(`qr_phone = $${i++}`); params.push(qr_phone); }
  if (activo !== undefined) { sets.push(`activo = $${i++}`); params.push(activo); }
  if (sets.length === 0) return;

  params.push(canalId);
  await query(`UPDATE canales SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i}`, params);
}

export async function iniciarSesion(canalIdRaw, empresaId) {
  const canalId = String(canalIdRaw);
  const existente = sesiones.get(canalId);
  if (existente && existente.status !== 'disconnected') {
    return existente;
  }

  const dir = authDir(canalId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined;
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  const sesion = { sock, status: 'connecting', qrString: null, phone: null, empresaId };
  sesiones.set(canalId, sesion);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      sesion.status = 'qr';
      sesion.qrString = qr;
      await actualizarCanalDb(canalId, { qr_status: 'qr' }).catch(() => {});
      return;
    }

    if (connection === 'connecting') {
      sesion.status = 'connecting';
      return;
    }

    if (connection === 'open') {
      const rawId = sock.user?.id ?? '';
      const phone = rawId.split(':')[0] ?? rawId.split('@')[0] ?? rawId;
      sesion.status = 'connected';
      sesion.qrString = null;
      sesion.phone = phone;
      await actualizarCanalDb(canalId, { qr_status: 'connected', qr_phone: phone, activo: true }).catch(() => {});
      return;
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output?.statusCode
        : undefined;

      if (code === DisconnectReason.loggedOut) {
        sesion.status = 'disconnected';
        sesiones.delete(canalId);
        await actualizarCanalDb(canalId, { qr_status: 'disconnected', qr_phone: null, activo: false }).catch(() => {});
        return;
      }

      sesion.status = 'disconnected';
      await actualizarCanalDb(canalId, { qr_status: 'disconnected' }).catch(() => {});
      setTimeout(() => {
        iniciarSesion(canalId, empresaId).catch((err) => console.error('[baileys] error reconectando:', err.message));
      }, code === 440 ? 15000 : 5000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      await procesarMensaje(canalId, empresaId, msg, sock).catch((err) =>
        console.error('[baileys] error procesando mensaje:', err.message)
      );
    }
  });

  return sesion;
}

const TIPOS_CON_ARCHIVO = new Set(['image', 'video', 'audio', 'document', 'sticker']);

async function procesarMensaje(canalId, empresaId, msg, sock) {
  const jid = msg.key.remoteJid ?? '';
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return;

  const esSaliente = Boolean(msg.key.fromMe);

  // Baileys puede reentregar el mismo evento messages.upsert (reconexiones,
  // sincronización) y un eco saliente (fromMe) del propio envío del CRM ya
  // existe con este mismo plataforma_mensaje_id: en ambos casos, no reprocesar
  // — si no, un mensaje entrante duplicado dispara una segunda respuesta de la IA.
  const existente = await query(
    'SELECT 1 FROM mensajes WHERE plataforma_mensaje_id = $1 AND empresa_id = $2',
    [msg.key.id, empresaId]
  );
  if (existente.rows.length > 0) return;

  // Los contactos con privacidad activada llegan como @lid (identificador vinculado)
  // en vez del número real. Hay que conservar el JID completo para poder responderles;
  // reconstruir "<numero>@s.whatsapp.net" a partir de un LID apunta a un destino inexistente.
  const numero = jid.endsWith('@lid') ? jid : jid.split('@')[0];
  const m = msg.message;
  let texto = null;
  let tipo = 'text';

  if (m?.conversation) {
    texto = m.conversation;
  } else if (m?.extendedTextMessage?.text) {
    texto = m.extendedTextMessage.text;
  } else if (m?.imageMessage) {
    texto = m.imageMessage.caption || '[Imagen]';
    tipo = 'image';
  } else if (m?.videoMessage) {
    texto = m.videoMessage.caption || '[Video]';
    tipo = 'video';
  } else if (m?.audioMessage) {
    texto = '[Audio]';
    tipo = 'audio';
  } else if (m?.documentMessage) {
    texto = m.documentMessage.fileName || '[Documento]';
    tipo = 'document';
  } else if (m?.stickerMessage) {
    texto = '[Sticker]';
    tipo = 'sticker';
  } else if (m?.locationMessage) {
    texto = '[Ubicación]';
    tipo = 'location';
  } else if (m?.contactMessage) {
    texto = '[Contacto]';
    tipo = 'contact';
  }

  if (!texto) {
    console.warn('[baileys] mensaje sin contenido soportado, descartado. tipos presentes:', m ? Object.keys(m) : msg);
    return;
  }

  let mediaUrl = null;
  if (TIPOS_CON_ARCHIVO.has(tipo)) {
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
      const mimetype = m[`${tipo}Message`]?.mimetype;
      const nombreSugerido = tipo === 'document' ? m.documentMessage?.fileName : null;
      mediaUrl = guardarMedia(empresaId, buffer, mimetype, nombreSugerido);
    } catch (err) {
      console.error('[baileys] error descargando media, se guarda solo el placeholder:', err.message);
    }
  }

  const nombreContacto = msg.pushName || numero;

  let cliente = await query(
    'SELECT id_cliente FROM clientes WHERE telefono = $1 AND id_empresa = $2',
    [numero, empresaId]
  );
  if (cliente.rows.length === 0) {
    cliente = await query(
      `INSERT INTO clientes (id_empresa, nombre, telefono, estado)
       VALUES ($1, $2, $3, 'activo') RETURNING id_cliente`,
      [empresaId, nombreContacto, numero]
    );
  }

  let contacto = await query(
    'SELECT * FROM contactos WHERE numero_telefono = $1 AND empresa_id = $2',
    [numero, empresaId]
  );
  if (contacto.rows.length === 0) {
    contacto = await query(
      `INSERT INTO contactos (empresa_id, id_cliente, numero_telefono, nombre, plataforma, creado_en)
       VALUES ($1, $2, $3, $4, 'whatsapp', NOW()) RETURNING *`,
      [empresaId, cliente.rows[0].id_cliente, numero, nombreContacto]
    );
  }

  const contactoId = contacto.rows[0].id_contactos;

  let conversacion = await query(
    `SELECT * FROM conversaciones
     WHERE empresa_id = $1 AND contacto_id = $2 AND estado IN ('abierta', 'sin_respuesta')
     ORDER BY creado_en DESC LIMIT 1`,
    [empresaId, contactoId]
  );
  if (conversacion.rows.length === 0) {
    conversacion = await query(
      `INSERT INTO conversaciones (empresa_id, contacto_id, plataforma, estado, ultimo_mensaje_en, creado_en)
       VALUES ($1, $2, 'whatsapp', 'abierta', NOW(), NOW()) RETURNING *`,
      [empresaId, contactoId]
    );
  } else {
    // Un mensaje nuevo del cliente reactiva una conversación "enfriada"
    await query(
      "UPDATE conversaciones SET ultimo_mensaje_en = NOW(), estado = 'abierta' WHERE conversaciones_id = $1",
      [conversacion.rows[0].conversaciones_id]
    );
  }

  const conversacionId = conversacion.rows[0].conversaciones_id;

  // ON CONFLICT DO NOTHING: red de seguridad ante una carrera real (dos procesos
  // procesando el mismo mensaje casi al mismo tiempo) — el chequeo de arriba
  // (SELECT) no es atómico por sí solo. Si perdemos la carrera, no hay fila que
  // devolver: hay que cortar acá y no duplicar el mensaje ni la respuesta de la IA.
  const nuevoMensaje = await query(
    `INSERT INTO mensajes
     (conversacion_id, empresa_id, plataforma_mensaje_id, direccion, contenido, tipo, media_url, estado, fecha_hora, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (empresa_id, plataforma_mensaje_id) WHERE plataforma_mensaje_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [
      conversacionId,
      empresaId,
      msg.key.id,
      esSaliente ? 'saliente' : 'entrante',
      texto,
      tipo,
      mediaUrl,
      esSaliente ? 'sent' : 'recibido',
      new Date((Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000)) * 1000),
    ]
  );

  if (nuevoMensaje.rows.length === 0) return;

  notificarNuevoMensaje(empresaId, {
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

  if (!esSaliente && !conversacion.rows[0].asignado_a_humano) {
    await responderConIA(canalId, empresaId, conversacionId, numero).catch((err) =>
      console.error('[baileys] error generando/enviando respuesta IA:', err.message)
    );
  }
}

// Genera una respuesta con IA para la conversación y la envía por WhatsApp,
// dejando registrado el mensaje saliente como si lo hubiera mandado un agente.
async function responderConIA(canalId, empresaId, conversacionId, numero) {
  const historial = await query(
    `SELECT direccion, contenido FROM mensajes
     WHERE conversacion_id = $1
     ORDER BY fecha_hora DESC LIMIT 10`,
    [conversacionId]
  );

  const mensajesContexto = historial.rows.reverse().map((m) => ({
    rol: m.direccion === 'entrante' ? 'usuario' : 'asistente',
    contenido: m.contenido,
  }));

  const resultado = await generarRespuestaIA(empresaId, mensajesContexto, conversacionId);
  if (!resultado || !resultado.sugerencia) return;

  const result = await enviarMensaje(canalId, numero, resultado.sugerencia);
  const whatsappMessageId = result?.key?.id || `qr_${Date.now()}`;

  const nuevoMensaje = await query(
    `INSERT INTO mensajes
     (conversacion_id, empresa_id, plataforma_mensaje_id, direccion, contenido, tipo, estado, fecha_hora, creado_en)
     VALUES ($1, $2, $3, 'saliente', $4, 'text', 'sent', NOW(), NOW())
     RETURNING *`,
    [conversacionId, empresaId, whatsappMessageId, resultado.sugerencia]
  );

  await query(
    `UPDATE conversaciones SET ultimo_mensaje_en = NOW() WHERE conversaciones_id = $1`,
    [conversacionId]
  );

  notificarNuevoMensaje(empresaId, {
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
}

export async function obtenerEstado(canalIdRaw) {
  const canalId = String(canalIdRaw);
  let sesion = sesiones.get(canalId);
  if (!sesion) {
    const canal = await query('SELECT empresa_id, qr_status, qr_phone FROM canales WHERE id = $1', [canalId]);
    const row = canal.rows[0];
    if (!row) return { status: 'disconnected', phone: null };

    // No hay sesión en memoria (server recién reiniciado, o se cayó la conexión):
    // reintentar para poder generar un QR nuevo en vez de quedar "disconnected" para siempre.
    sesion = await iniciarSesion(canalId, row.empresa_id).catch(() => null);
    if (!sesion) return { status: row.qr_status || 'disconnected', phone: row.qr_phone || null };
  }

  if (sesion.status === 'qr' && sesion.qrString) {
    const qrPng = await QRCode.toDataURL(sesion.qrString, { width: 320, margin: 2 });
    return { status: 'qr', qrPng };
  }

  return { status: sesion.status, phone: sesion.phone };
}

export async function enviarMensaje(canalIdRaw, numero, texto) {
  const canalId = String(canalIdRaw);
  const sesion = sesiones.get(canalId);
  if (!sesion || sesion.status !== 'connected') {
    throw new Error('El canal de WhatsApp (QR) no está conectado.');
  }
  const jid = numero.includes('@') ? numero : `${numero}@s.whatsapp.net`;
  const result = await sesion.sock.sendMessage(jid, { text: texto });
  return result;
}

export async function enviarArchivo(canalIdRaw, numero, buffer, fileName, mimetype, caption = '') {
  const canalId = String(canalIdRaw);
  const sesion = sesiones.get(canalId);
  if (!sesion || sesion.status !== 'connected') {
    throw new Error('El canal de WhatsApp (QR) no está conectado.');
  }
  const jid = numero.includes('@') ? numero : `${numero}@s.whatsapp.net`;
  const result = await sesion.sock.sendMessage(jid, {
    document: buffer,
    fileName,
    mimetype: mimetype || 'application/octet-stream',
    caption,
  });
  return result;
}

export async function cerrarSesion(canalIdRaw) {
  const canalId = String(canalIdRaw);
  const sesion = sesiones.get(canalId);
  if (sesion) {
    try { await sesion.sock.logout(); } catch {}
    try { sesion.sock.end(undefined); } catch {}
    sesiones.delete(canalId);
  }
  const dir = authDir(canalId);
  fs.rmSync(dir, { recursive: true, force: true });
  await actualizarCanalDb(canalId, { qr_status: 'disconnected', qr_phone: null, activo: false }).catch(() => {});
}

// Cierra todos los sockets activos SIN desvincular el dispositivo (no borra
// credenciales). Se usa al apagar el proceso (SIGTERM/SIGINT) para que WhatsApp
// registre la desconexión antes de que un proceso nuevo (redeploy, nodemon,
// crash-restart) intente reconectar con la misma sesión — si no, durante el
// solape ambos sockets quedan "vivos" y cada uno responde por su cuenta al
// mismo mensaje entrante, duplicando las respuestas de la IA.
export function cerrarTodosLosSockets() {
  for (const sesion of sesiones.values()) {
    try { sesion.sock.end(undefined); } catch {}
  }
  sesiones.clear();
}

export async function restaurarSesiones() {
  try {
    const result = await query(
      `SELECT id, empresa_id FROM canales WHERE tipo = 'whatsapp' AND metodo_conexion = 'qr' AND activo = true`
    );
    for (const canal of result.rows) {
      if (fs.existsSync(authDir(canal.id))) {
        iniciarSesion(canal.id, canal.empresa_id).catch((err) =>
          console.error(`[baileys] error restaurando canal ${canal.id}:`, err.message)
        );
      }
    }
  } catch (err) {
    console.error('[baileys] error restaurando sesiones:', err.message);
  }
}
