import WhatsAppService from './src/service/whatsappService';
import dotenv from 'dotenv';

dotenv.config();

const testearCredenciales = async () => {
  console.log('\n🔍 VERIFICACIÓN DE CREDENCIALES DE WHATSAPP');
  console.log('='.repeat(60));
  
  const whatsappService = new WhatsAppService();
  
  // 1. Verificar que existan
  console.log('\n1️⃣ Verificando variables de entorno...');
  const credencialesOk = whatsappService.verificarCredenciales();
  
  if (!credencialesOk) {
    console.log('\n❌ Configura las siguientes variables en tu .env:');
    console.log('   - WHATSAPP_PHONE_NUMBER_ID');
    console.log('   - WHATSAPP_ACCESS_TOKEN');
    console.log('   - WHATSAPP_BUSINESS_ACCOUNT_ID');
    console.log('\n📚 Consulta la documentación de Meta para obtenerlas:');
    console.log('   https://developers.facebook.com/docs/whatsapp/business-management-api/get-started');
    process.exit(1);
  }
  
  // 2. Probar conexión
  console.log('\n2️⃣ Probando conexión con WhatsApp API...');
  try {
    const info = await whatsappService.obtenerInfoTelefono();
    console.log('✅ Conexión exitosa!');
    console.log('   Teléfono:', info.display_phone_number);
    console.log('   Verificado:', info.verified_name);
  } catch (error) {
    console.log('❌ Error de conexión:', error.message);
    process.exit(1);
  }
  
  // 3. Obtener perfil
  console.log('\n3️⃣ Obteniendo perfil de negocio...');
  try {
    const perfil = await whatsappService.obtenerPerfilNegocio();
    console.log('✅ Perfil obtenido:');
    console.log('   Nombre:', perfil.data[0]?.about || 'No configurado');
    console.log('   Descripción:', perfil.data[0]?.description || 'No configurado');
  } catch (error) {
    console.log('⚠️  No se pudo obtener el perfil:', error.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ TODO LISTO! Tu configuración de WhatsApp está funcionando.\n');
};

testearCredenciales();