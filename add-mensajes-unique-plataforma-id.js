import { query } from './src/config/database.js';

async function migrar() {
  try {
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mensajes_empresa_plataforma_msg_id_key
      ON mensajes (empresa_id, plataforma_mensaje_id)
      WHERE plataforma_mensaje_id IS NOT NULL
    `);
    console.log('✅ Índice único aplicado: evita mensajes duplicados por plataforma_mensaje_id.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en migración:', error.message);
    process.exit(1);
  }
}

migrar();
