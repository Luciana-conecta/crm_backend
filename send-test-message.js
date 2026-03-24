// send-test-message.js - CORREGIDO
import WhatsappService from './src/service/whatsappService.js';
import dotenv from 'dotenv';

dotenv.config();

const enviarMensaje = async () => {
  console.log('📤 ENVIANDO MENSAJE DE PRUEBA\n');
  
  // ⭐ Tu número
  const miNumero = '595981335805';
  
  const whatsapp = new WhatsappService();
  
  try {
    const response = await whatsapp.enviarMensajeTexto(
      miNumero,
      '🚀 ¡Hola! Este es un mensaje de prueba desde Insignia CRM.\n\nSi recibiste esto, ¡todo está funcionando perfectamente! 🎉'
    );
    
    console.log('✅ MENSAJE ENVIADO EXITOSAMENTE\n');
    console.log('Detalles:');
    console.log('  • ID del mensaje:', response.messages[0].id);
    console.log('  • Estado:', response.messages[0].message_status || 'aceptado');
    console.log('\n💡 Revisa tu WhatsApp para ver el mensaje\n');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    
    if (error.message.includes('190')) {
      console.log('\n💡 Token inválido o expirado.');
      console.log('   Ve a: https://developers.facebook.com/apps');
      console.log('   Y genera un nuevo access token');
    } else if (error.message.includes('131031')) {
      console.log('\n💡 Número de teléfono inválido');
      console.log('   Formato correcto: 595981234567 (sin + ni espacios)');
    }
  }
};

enviarMensaje();