import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error ', err);
  process.exit(-1);
});

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

export const getClient = () => pool.connect();

// El ON CONFLICT (empresa_id, plataforma_mensaje_id) en baileysService.js exige
// que este índice exista; antes vivía solo en un script suelto (add-mensajes-unique-plataforma-id.js)
// que había que correr a mano contra la base, y si nunca se corrió el INSERT
// de cada mensaje entrante por WhatsApp-QR fallaba en silencio (atrapado por el
// .catch() del listener), dejando conversaciones enteras sin mensajes guardados.
export const asegurarIndicesCriticos = async () => {
  try {
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mensajes_empresa_plataforma_msg_id_key
      ON mensajes (empresa_id, plataforma_mensaje_id)
      WHERE plataforma_mensaje_id IS NOT NULL
    `);
  } catch (error) {
    console.error('[db] no se pudo asegurar mensajes_empresa_plataforma_msg_id_key:', error.message);
  }
};

export default pool;
