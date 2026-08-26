import { query, getClient } from '../config/database.js';
import { notificarEscalamiento } from '../service/websocketService.js';
import { cargarContexto, generarRespuestaIA } from '../service/iaService.js';

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
  const { mensajes = [] } = req.body;

  if (mensajes.length === 0) {
    return res.status(400).json({ success: false, error: 'Se requiere al menos un mensaje' });
  }

  const resultado = await generarRespuestaIA(id, mensajes);

  if (resultado === null) {
    return res.status(403).json({ success: false, error: 'El asistente IA está desactivado. Actívalo en la configuración.' });
  }

  console.log(`[IA] Sugerencia para empresa ${id} | intención: ${resultado.intencion}`);

  res.json({ success: true, data: resultado });
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

  notificarEscalamiento(empresaId, {
    conversacionId: result.rows[0].conversaciones_id,
    estado: result.rows[0].estado,
  });

  res.json({ success: true, data: result.rows[0] });
};

// ─── POST /whatsapp/conversaciones/:id/reactivar-ia ───────────────────────────

export const reactivarIA = async (req, res) => {
  const { conversacionId } = req.params;
  const empresaId = req.user.empresa_id;

  const result = await query(
    `UPDATE conversaciones
     SET asignado_a_humano = false,
         actualizado_en    = NOW()
     WHERE conversaciones_id = $1 AND empresa_id = $2
     RETURNING conversaciones_id, asignado_a_humano, estado`,
    [conversacionId, empresaId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Conversación no encontrada' });
  }

  console.log(`[IA] Conversación ${conversacionId} reactivada para IA`);

  notificarEscalamiento(empresaId, {
    conversacionId: result.rows[0].conversaciones_id,
    estado: result.rows[0].estado,
  });

  res.json({ success: true, data: result.rows[0] });
};
