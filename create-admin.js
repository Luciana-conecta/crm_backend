import bcrypt from 'bcrypt';
import { query } from './src/config/database.js';

const email = 'techflow@conecta.com';
const password = 'conecta123';

async function updateAdminPassword() {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    console.log('\n=== HASH GENERADO ===\n');
    console.log(`Hash: ${hashedPassword}\n`);
    
    // Actualizar o insertar usuario
    const result = await query(
      `INSERT INTO usuarios (email, password, tipo_usuario, estado) 
       VALUES ($1, $2, 'super_admin', 'activo')
       ON CONFLICT (email) DO UPDATE 
       SET password = $2
       RETURNING usuarios_id, email, tipo_usuario, estado;`,
      [email, hashedPassword]
    );
    
    console.log('=== USUARIO CREADO/ACTUALIZADO ===\n');
    console.log(result.rows[0]);
    
    console.log('\n=== DATOS DE ACCESO ===\n');
    console.log(`Email: ${email}`);
    console.log(`Contraseña: ${password}\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

updateAdminPassword();
