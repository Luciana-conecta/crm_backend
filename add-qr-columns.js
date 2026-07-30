import { query } from './src/config/database.js';

async function migrar() {
  try {
    await query(`
      ALTER TABLE canales
        ADD COLUMN IF NOT EXISTS metodo_conexion VARCHAR(20) NOT NULL DEFAULT 'cloud_api',
        ADD COLUMN IF NOT EXISTS qr_status VARCHAR(20) NOT NULL DEFAULT 'disconnected',
        ADD COLUMN IF NOT EXISTS qr_phone VARCHAR(30)
    `);

    await query(`ALTER TABLE canales ALTER COLUMN phone_number_id DROP NOT NULL`).catch(() => {});
    await query(`ALTER TABLE canales ALTER COLUMN access_token DROP NOT NULL`).catch(() => {});
    await query(`ALTER TABLE canales ALTER COLUMN business_account_id DROP NOT NULL`).catch(() => {});

    console.log('✅ Migración de columnas QR aplicada a la tabla canales.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en migración:', error.message);
    process.exit(1);
  }
}

migrar();
