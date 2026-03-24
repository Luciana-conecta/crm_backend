// test-webhook.js - CORREGIDO
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

const tests = async () => {
  console.log('🧪 TESTING WEBHOOK LOCALMENTE\n');
  
  // Test 1: Health Check
  console.log('1️⃣ Health Check...');
  try {
    const health = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Status:', health.status);
    console.log('   Data:', JSON.stringify(health.data, null, 2));
  } catch (e) {
    console.log('❌ Error:', e.message);
    return;
  }
  
  // Test 2: Verificación del Webhook
  console.log('\n2️⃣ Verificación del Webhook...');
  try {
    // ⭐ CAMBIO: Agregar /api/whatsapp antes de /webhooks/whatsapp
    const verify = await axios.get(`${BASE_URL}/api/whatsapp/webhooks/whatsapp`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'insignia_webhook_secure_2024',
        'hub.challenge': 'CHALLENGE_TEST_123'
      }
    });
    console.log('✅ Status:', verify.status);
    console.log('   Challenge devuelto:', verify.data);
  } catch (e) {
    console.log('❌ Error:', e.response?.status || e.code);
    console.log('   Mensaje:', e.response?.data?.message);
  }
  
  // Test 3: Mensaje Mock
  console.log('\n3️⃣ Enviando mensaje mock...');
  const mockMessage = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '1234567890',
            phone_number_id: 'PHONE_NUMBER_ID'
          },
          contacts: [{
            profile: { name: 'Test User' },
            wa_id: '595981234567'
          }],
          messages: [{
            from: '595981234567',
            id: 'wamid.test_' + Date.now(),
            timestamp: String(Math.floor(Date.now() / 1000)),
            text: { body: 'Hola! Este es un mensaje de prueba' },
            type: 'text'
          }]
        },
        field: 'messages'
      }]
    }]
  };
  
  try {
    // ⭐ CAMBIO: Agregar /api/whatsapp antes de /webhooks/whatsapp
    const msg = await axios.post(`${BASE_URL}/api/whatsapp/webhooks/whatsapp`, mockMessage);
    console.log('✅ Status:', msg.status);
    console.log('   Mensaje procesado correctamente');
  } catch (e) {
    console.log('❌ Error:', e.response?.status || e.code);
    console.log('   Mensaje:', e.response?.data?.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📝 Notas:');
  console.log('   • Health: http://localhost:3001/health');
  console.log('   • Webhook GET: http://localhost:3001/api/whatsapp/webhooks/whatsapp');
  console.log('   • Webhook POST: http://localhost:3001/api/whatsapp/webhooks/whatsapp');
  console.log('='.repeat(60) + '\n');
};

tests();