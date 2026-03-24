import express from 'express';
import { authenticateToken, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import suscripcionController from '../controllers/suscripcionController.js';

const router = express.Router();

// Rutas self-service para admin_empresa y usuario_empresa
// GET /api/billing/mi-suscripcion
router.get(
  '/mi-suscripcion',
  authenticateToken,
  authorize('admin_empresa', 'usuario_empresa'),
  asyncHandler(suscripcionController.getMiSuscripcion)
);

// GET /api/billing/historial-pagos
router.get(
  '/historial-pagos',
  authenticateToken,
  authorize('admin_empresa', 'usuario_empresa'),
  asyncHandler(suscripcionController.getHistorialPagos)
);

export default router;
