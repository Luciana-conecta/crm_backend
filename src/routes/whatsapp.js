import express from 'express';
import  whatsappWebhookController  from '../controllers/webhookController.js';
import  {inboxController, uploadArchivo } from '../controllers/inboxController.js';
import  { canalController } from '../controllers/canalController.js';
import  {authenticateToken  }  from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { transferirHumano, reactivarIA } from '../controllers/iaController.js';


const router = express.Router();
router.get('/webhooks/whatsapp', whatsappWebhookController.verificarWebhook);
router.post('/webhooks/whatsapp', whatsappWebhookController.recibirWebhook);
router.get('/empresas/:empresaId/conversaciones', authenticateToken, inboxController.obtenerConversaciones);
router.get('/conversaciones/:conversacionId/mensajes', authenticateToken, inboxController.obtenerMensajes);
router.post('/conversaciones/enviar', authenticateToken, inboxController.enviarMensaje);
router.patch('/conversaciones/:conversacionId', authenticateToken, inboxController.actualizarEstado);
router.post('/conversaciones/:conversacionId/marcar-leido', authenticateToken, inboxController.marcarComoLeido);
router.post('/conversaciones/:conversacionId/enviar-archivo', authenticateToken, uploadArchivo, inboxController.enviarArchivo);
router.get('/media/:empresaId/:filename', authenticateToken, inboxController.obtenerMedia);
router.get('/media-publico/:empresaId/:filename', inboxController.obtenerMediaPublico);
router.post('/conversaciones/:conversacionId/transferir-humano', authenticateToken, asyncHandler(transferirHumano));
router.post('/conversaciones/:conversacionId/reactivar-ia', authenticateToken, asyncHandler(reactivarIA));

// Canales WhatsApp
router.get('/empresas/:empresaId/canales', authenticateToken, canalController.listarCanales);
router.post('/empresas/:empresaId/canales', authenticateToken, canalController.crearCanal);
router.put('/canales/:canalId', authenticateToken, canalController.actualizarCanal);
router.delete('/canales/:canalId', authenticateToken, canalController.eliminarCanal);
router.post('/canales/:canalId/probar', authenticateToken, canalController.probarCanal);

// Canal WhatsApp vía QR (Baileys)
router.post('/empresas/:empresaId/canales/qr', authenticateToken, canalController.crearCanalQR);
router.get('/canales/:canalId/qr-estado', authenticateToken, canalController.estadoCanalQR);
router.post('/canales/:canalId/qr-desconectar', authenticateToken, canalController.desconectarCanalQR);

export default router;