import OpenAI from 'openai';
import { query } from '../config/database.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INTENCIONES_DERIVAR = ['intencion_compra', 'solicitud_humano', 'agendar_cita'];
const notificarTelegram = async ({ empresa, chatId, mensajes, intencion }) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const destinatario = process.env.TELEGRAM_NOTIFICACIONES_CHAT_ID; // grupo/chat interno de ventas

  if (!token || !destinatario) return;

  const ultimoMensajeUsuario = [...mensajes].reverse().find((m) => m.rol === 'usuario')?.contenido || '';

  const texto =
    `🔔 *Nueva conversación para derivar*\n` +
    `Empresa: ${empresa?.nombre || 'N/D'}\n` +
    `Intención detectada: ${intencion}\n` +
    `Chat: ${chatId}\n\n` +
    `Último mensaje del cliente:\n"${ultimoMensajeUsuario}"`;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: destinatario,
        text: texto,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('Error notificando por Telegram:', err);
  }
};

export const cargarContexto = async (empresaId) => {
  const [configRes, productosRes, faqsRes, reglasRes, empresaRes] = await Promise.all([
    query('SELECT * FROM ia_config WHERE empresa_id = $1', [empresaId]),
    query('SELECT * FROM ia_productos WHERE empresa_id = $1 ORDER BY orden ASC', [empresaId]),
    query('SELECT * FROM ia_faqs WHERE empresa_id = $1 ORDER BY orden ASC', [empresaId]),
    query('SELECT * FROM ia_reglas_escalamiento WHERE empresa_id = $1', [empresaId]),
    query('SELECT nombre FROM empresas WHERE empresa_id = $1', [empresaId]),
  ]);

  return {
    config: configRes.rows[0] || null,
    productos: productosRes.rows,
    faqs: faqsRes.rows,
    reglas: reglasRes.rows,
    empresa: empresaRes.rows[0] || null,
  };
};

// ─── Helper: construir system prompt ─────────────────────────────────────────

export const buildSystemPrompt = ({ config, productos, faqs, reglas, empresa }) => {
  const nombre = empresa?.nombre || 'la empresa';
  const tono = config?.tono || 'profesional';
  const industria = config?.industria ? `del sector ${config.industria}` : '';
  const descripcion = config?.descripcion_negocio || '';

  let prompt = `Eres el asistente virtual de ${nombre}${industria ? ` ${industria}` : ''}`;
  if (descripcion) prompt += `, ${descripcion}`;
  prompt += `.\n\nTu tono de comunicación es: ${tono}.\n`;
  prompt += `Siempre responde en español, de forma concisa y útil.\n`;
  prompt += `No inventes información que no esté en el contexto proporcionado.\n\n`;

  if (productos.length > 0) {
    prompt += `## PRODUCTOS Y SERVICIOS\n`;
    productos.forEach((p, i) => {
      prompt += `${i + 1}. **${p.nombre}**`;
      if (p.precio) prompt += ` — ${p.precio}`;
      if (p.descripcion) prompt += `\n   ${p.descripcion}`;
      prompt += '\n';
    });
      prompt += `\nIMPORTANTE: puede haber más de un producto con nombres muy parecidos que en realidad son variantes distintas (distinta sede, sucursal, horario o modalidad). Antes de responder, revisá la lista COMPLETA de arriba:\n`;
      prompt += `- Si el usuario menciona una sede/ubicación específica, respondé únicamente con los datos del producto cuyo nombre coincide con esa sede.\n`;
      prompt += `- Si el usuario pregunta de forma general y existen varias variantes del mismo producto, mencioná TODAS las opciones que coincidan (no elijas una sola arbitrariamente) y pedí que precise cuál le interesa si es necesario.\n\n`;

      prompt += `## REGLA DE VENTA CONSULTIVA (precio)\n`;
      prompt += `No reveles el precio en tu primera respuesta a una consulta general sobre un producto/curso, salvo que el usuario lo pida explícitamente (ej: "cuánto cuesta", "precio", "vale", "cuánto sale").\n`;
      prompt += `Antes de hablar de precio:\n`;
      prompt += `1. Identificá qué busca la persona (objetivo, nivel, disponibilidad, para qué lo necesita).\n`;
      prompt += `2. Destacá 1-2 beneficios concretos ligados a lo que preguntó (no una lista genérica).\n`;
      prompt += `3. Recién ahí, si corresponde, dale el precio junto con el valor (qué incluye, próxima fecha/cupo, forma de pago) y proponé un siguiente paso (agendar, dejar WhatsApp, reservar lugar).\n`;
      prompt += `Si el usuario pregunta el precio directo en su primer mensaje, respondé con el precio pero acompañado de un beneficio y un llamado a la acción — nunca lo dejes seco, sin contexto.\n\n`;
  }

  if (faqs.length > 0) {
    prompt += `## PREGUNTAS FRECUENTES\n`;
    faqs.forEach((f) => {
      prompt += `**${f.pregunta}**\n${f.respuesta}\n\n`;
    });
  }

  if (reglas.length > 0) {
    prompt += `## CUÁNDO DERIVAR A UN HUMANO\n`;
    reglas.forEach((r) => {
      prompt += `- Si detectas: ${r.condicion}${r.descripcion ? ` — ${r.descripcion}` : ''}\n`;
    });
    prompt += '\n';
  }

  if (config?.instrucciones_adicionales) {
    prompt += `## INSTRUCCIONES ESPECIALES\n${config.instrucciones_adicionales}\n\n`;
  }

  prompt += `## PROHIBIDO AGENDAR REUNIONES O CITAS POR TU CUENTA\n`;
  prompt += `Nunca confirmes, propongas ni aceptes una fecha, horario o reunión específica en nombre de ${nombre}. No digas frases como "quedamos el [día] a las [hora]" ni "confirmado, te espero".\n`;
  prompt += `Si el usuario quiere coordinar una cita/reunión/llamada, decile que un miembro del equipo se va a contactar para coordinar el horario, y NO cierres vos el detalle.\n\n`;

  prompt += `## CLASIFICACIÓN DE INTENCIÓN
Al final de cada respuesta, en una línea separada escribe exactamente:
INTENCION: [tipo]

Tipos posibles:
- saludo
- despedida
- consulta_general
- consulta_precio
- intencion_compra
- queja
- solicitud_humano
- agendar_cita (el usuario quiere coordinar una cita, reunión o llamada)
- otro`;

  return prompt;
};

// ─── Generar una respuesta de IA para una conversación ───────────────────────
// mensajes: [{ rol: 'usuario' | 'asistente', contenido: string }, ...]
// Devuelve null si el asistente IA está desactivado para la empresa (config.activo !== true).

export const generarRespuestaIA = async (empresaId, mensajes = [], chatId = null) => {
  const contexto = await cargarContexto(empresaId);

  if (contexto.config?.activo !== true) {
    return null;
  }

  const systemPrompt = buildSystemPrompt(contexto);

  const ultimosMensajes = mensajes.slice(-10).map((m) => ({
    role: m.rol === 'usuario' ? 'user' : 'assistant',
    content: m.contenido,
  }));

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 500,
    messages: [
      { role: 'system', content: systemPrompt },
      ...ultimosMensajes,
    ],
  });

  const textoCompleto = response.choices[0].message.content;

  const lineas = textoCompleto.trim().split('\n');
  const lineaIntencion = lineas.findLast((l) => l.startsWith('INTENCION:'));
  const intencion = lineaIntencion
    ? lineaIntencion.replace('INTENCION:', '').trim().toLowerCase()
    : 'otro';

  const sugerencia = lineas
    .filter((l) => !l.startsWith('INTENCION:'))
    .join('\n')
    .trim();

  if (INTENCIONES_DERIVAR.includes(intencion)) {
    notificarTelegram({ empresa: contexto.empresa, chatId, mensajes, intencion }); // no bloqueante
  }

  return { sugerencia, intencion };
};
