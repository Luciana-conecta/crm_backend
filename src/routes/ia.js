import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getConfig, saveConfig, sugerir } from '../controllers/iaController.js';

const router = express.Router();

router.use(authenticateToken);

// Configuración del asistente IA por empresa
router.get('/empresa/:id/config',  asyncHandler(getConfig));
router.post('/empresa/:id/config', asyncHandler(saveConfig));

// Sugerencia de respuesta (el núcleo)
router.post('/empresa/:id/sugerir', asyncHandler(sugerir));

export default router;
