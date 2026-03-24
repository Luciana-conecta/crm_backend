import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { socialController } from '../controllers/socialController.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/empresas/:empresaId/canales',       asyncHandler(socialController.listarCanales));
router.post('/empresas/:empresaId/canales',      asyncHandler(socialController.crearCanal));
router.put('/canales/:canalId',                  asyncHandler(socialController.actualizarCanal));
router.delete('/canales/:canalId',               asyncHandler(socialController.eliminarCanal));
router.patch('/canales/:canalId/toggle',         asyncHandler(socialController.toggleActivo));

export default router;
