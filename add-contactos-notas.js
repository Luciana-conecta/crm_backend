import { query } from './src/config/database.js';

async function migrar() {
  try {
    await query(`ALTER TABLE contactos ADD COLUMN IF NOT EXISTS notas TEXT`);
    console.log('✅ Migración aplicada: columna notas agregada a la tabla contactos.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en migración:', error.message);
    process.exit(1);
  }
}

migrar();
