import { query } from '../config/database.js';

/*
  SQL para crear la tabla si no existe (ejecutar una vez en la BD):

  CREATE TABLE IF NOT EXISTS pagos (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER REFERENCES empresas(empresa_id) ON DELETE CASCADE,
    plan_id INTEGER REFERENCES planes(id),
    monto DECIMAL(10,2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'pendiente',  -- pendiente | pagado | vencido
    fecha_pago TIMESTAMP,
    fecha_vencimiento TIMESTAMP,
    concepto VARCHAR(255),
    referencia VARCHAR(100),
    notas TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );
*/

const getPagos = async (req, res) => {
  const { empresaId } = req.query;
  const params = [];
  const where = empresaId ? `WHERE p.empresa_id = $${params.push(empresaId)}` : '';

  const result = await query(
    `SELECT p.*,
            e.nombre AS empresa_nombre,
            pl.nombre AS plan_nombre
     FROM pagos p
     LEFT JOIN empresas e ON p.empresa_id = e.empresa_id
     LEFT JOIN planes pl ON p.plan_id = pl.id
     ${where}
     ORDER BY p.created_at DESC`,
    params
  );

  res.json({ success: true, data: result.rows });
};

const createPago = async (req, res) => {
  const {
    empresa_id, plan_id, monto, estado,
    fecha_pago, fecha_vencimiento, concepto, referencia, notas
  } = req.body;

  const result = await query(
    `INSERT INTO pagos
       (empresa_id, plan_id, monto, estado, fecha_pago, fecha_vencimiento, concepto, referencia, notas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [empresa_id, plan_id, monto, estado || 'pendiente',
     fecha_pago || null, fecha_vencimiento || null,
     concepto || null, referencia || null, notas || null]
  );

  res.status(201).json({ success: true, data: result.rows[0] });
};

const updatePago = async (req, res) => {
  const { id } = req.params;
  const {
    monto, estado, fecha_pago, fecha_vencimiento, concepto, referencia, notas
  } = req.body;

  const result = await query(
    `UPDATE pagos
     SET monto             = COALESCE($1, monto),
         estado            = COALESCE($2, estado),
         fecha_pago        = COALESCE($3, fecha_pago),
         fecha_vencimiento = COALESCE($4, fecha_vencimiento),
         concepto          = COALESCE($5, concepto),
         referencia        = COALESCE($6, referencia),
         notas             = COALESCE($7, notas)
     WHERE id = $8
     RETURNING *`,
    [monto, estado, fecha_pago || null, fecha_vencimiento || null,
     concepto, referencia, notas, id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Pago no encontrado' });
  }

  res.json({ success: true, data: result.rows[0] });
};

const deletePago = async (req, res) => {
  const { id } = req.params;

  const result = await query(
    'DELETE FROM pagos WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Pago no encontrado' });
  }

  res.json({ success: true, message: 'Pago eliminado exitosamente' });
};

export default { getPagos, createPago, updatePago, deletePago };
