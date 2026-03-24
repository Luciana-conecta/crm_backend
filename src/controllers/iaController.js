import OpenAI from 'openai';
import { query, getClient } from '../config/database.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Helper: cargar contexto completo de la empresa ──────────────────────────

const cargarContexto = async (empresaId) => {
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

const buildSystemPrompt = ({ config, productos, faqs, reglas, empresa }) => {
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
    productos.forEach((p) => {
      prompt += `- **${p.nombre}**`;
      if (p.precio) prompt += ` — ${p.precio}`;
      if (p.descripcion) prompt += `\n  ${p.descripcion}`;
      prompt += '\n';
    });
    prompt += '\n';
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
- otro`;

  return prompt;
};

// ─── GET /api/ia/empresa/:id/config ──────────────────────────────────────────

export const getConfig = async (req, res) => {
  const { id } = req.params;

  const { config, productos, faqs, reglas } = await cargarContexto(id);

  res.json({
    success: true,
    data: { config, productos, faqs, reglas },
  });
};

// ─── POST /api/ia/empresa/:id/config ─────────────────────────────────────────

export const saveConfig = async (req, res) => {
  const { id } = req.params;
  const { config, productos = [], faqs = [], reglas = [] } = req.body;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Upsert ia_config
    if (config) {
      await client.query(
        `INSERT INTO ia_config (empresa_id, activo, tono, industria, descripcion_negocio, instrucciones_adicionales, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (empresa_id) DO UPDATE
           SET activo                    = EXCLUDED.activo,
               tono                      = EXCLUDED.tono,
               industria                 = EXCLUDED.industria,
               descripcion_negocio       = EXCLUDED.descripcion_negocio,
               instrucciones_adicionales = EXCLUDED.instrucciones_adicionales,
               updated_at                = NOW()`,
        [
          id,
          config.activo ?? false,
          config.tono || 'profesional',
          config.industria || null,
          config.descripcion_negocio || null,
          config.instrucciones_adicionales || null,
        ]
      );
    }

    // Reemplazar productos
    await client.query('DELETE FROM ia_productos WHERE empresa_id = $1', [id]);
    for (const [i, p] of productos.entries()) {
      await client.query(
        `INSERT INTO ia_productos (empresa_id, nombre, descripcion, precio, orden) VALUES ($1, $2, $3, $4, $5)`,
        [id, p.nombre, p.descripcion || null, p.precio || null, i]
      );
    }

    // Reemplazar FAQs
    await client.query('DELETE FROM ia_faqs WHERE empresa_id = $1', [id]);
    for (const [i, f] of faqs.entries()) {
      await client.query(
        `INSERT INTO ia_faqs (empresa_id, pregunta, respuesta, orden) VALUES ($1, $2, $3, $4)`,
        [id, f.pregunta, f.respuesta, i]
      );
    }

    // Reemplazar reglas
    await client.query('DELETE FROM ia_reglas_escalamiento WHERE empresa_id = $1', [id]);
    for (const r of reglas) {
      await client.query(
        `INSERT INTO ia_reglas_escalamiento (empresa_id, condicion, descripcion) VALUES ($1, $2, $3)`,
        [id, r.condicion, r.descripcion || null]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const resultado = await cargarContexto(id);
  res.json({ success: true, data: resultado });
};

// ─── POST /api/ia/empresa/:id/sugerir ────────────────────────────────────────

export const sugerir = async (req, res) => {
  const { id } = req.params;
  const { mensajes = [], conversacionId } = req.body;

  if (mensajes.length === 0) {
    return res.status(400).json({ success: false, error: 'Se requiere al menos un mensaje' });
  }

  const contexto = await cargarContexto(id);

  if (contexto.config?.activo === false) {
    return res.status(403).json({ success: false, error: 'El asistente IA está desactivado. Actívalo en la configuración.' });
  }

  const systemPrompt = buildSystemPrompt(contexto);

  // Tomar los últimos 10 mensajes y convertir al formato de Anthropic
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

  // Extraer intención de la última línea
  const lineas = textoCompleto.trim().split('\n');
  const lineaIntencion = lineas.findLast((l) => l.startsWith('INTENCION:'));
  const intencion = lineaIntencion
    ? lineaIntencion.replace('INTENCION:', '').trim().toLowerCase()
    : 'otro';

  // Quitar la línea INTENCION del texto de la sugerencia
  const sugerencia = lineas
    .filter((l) => !l.startsWith('INTENCION:'))
    .join('\n')
    .trim();

  console.log(`[IA] Sugerencia para empresa ${id} | intención: ${intencion}`);

  res.json({ success: true, data: { sugerencia, intencion } });
};

// ─── POST /whatsapp/conversaciones/:id/transferir-humano ─────────────────────

export const transferirHumano = async (req, res) => {
  const { conversacionId } = req.params;
  const empresaId = req.user.empresa_id;

  const result = await query(
    `UPDATE conversaciones
     SET asignado_a_humano = true,
         actualizado_en    = NOW()
     WHERE conversaciones_id = $1 AND empresa_id = $2
     RETURNING conversaciones_id, asignado_a_humano, estado`,
    [conversacionId, empresaId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Conversación no encontrada' });
  }

  console.log(`[IA] Conversación ${conversacionId} transferida a humano`);
  res.json({ success: true, data: result.rows[0] });
};
