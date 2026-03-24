import express from 'express';
import  whatsappWebhookController  from '../controllers/webhookController.js';
import  {inboxController } from '../controllers/inboxController.js';
import  { canalController } from '../controllers/canalController.js';
import  {authenticateToken  }  from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { transferirHumano } from '../controllers/iaController.js';


const router = express.Router();
router.get('/webhooks/whatsapp', whatsappWebhookController.verificarWebhook);
router.post('/webhooks/whatsapp', whatsappWebhookController.recibirWebhook);
router.get('/empresas/:empresaId/conversaciones', authenticateToken, inboxController.obtenerConversaciones);
router.get('/conversaciones/:conversacionId/mensajes', authenticateToken, inboxController.obtenerMensajes);
router.post('/conversaciones/enviar', authenticateToken, inboxController.enviarMensaje);
router.patch('/conversaciones/:conversacionId', authenticateToken, inboxController.actualizarEstado);
router.post('/conversaciones/:conversacionId/marcar-leido', authenticateToken, inboxController.marcarComoLeido);
router.post('/conversaciones/:conversacionId/transferir-humano', authenticateToken, asyncHandler(transferirHumano));

// Canales WhatsApp
router.get('/empresas/:empresaId/canales', authenticateToken, canalController.listarCanales);
router.post('/empresas/:empresaId/canales', authenticateToken, canalController.crearCanal);
router.put('/canales/:canalId', authenticateToken, canalController.actualizarCanal);
router.delete('/canales/:canalId', authenticateToken, canalController.eliminarCanal);
router.post('/canales/:canalId/probar', authenticateToken, canalController.probarCanal);

export default router;