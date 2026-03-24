import express from 'express';
import { authenticateToken, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import adminController from '../controllers/adminController.js';
import pagoController from '../controllers/pagoController.js';
import suscripcionController from '../controllers/suscripcionController.js';

const router = express.Router();

router.get('/empresas',
  authenticateToken,
  authorize('super_admin'),
  asyncHandler(adminController.getCompanies)
);

router.post('/empresas',
  authenticateToken,
  authorize('super_admin'),
  asyncHandler(adminController.createCompany)
);

router.get('/empresas/:id',
  authenticateToken,
  authorize('super_admin'),
  asyncHandler(adminController.getCompanyById)
);

router.put('/empresas/:id',
  authenticateToken,
  authorize('super_admin'),
  asyncHandler(adminController.updateCompany)
);

router.delete('/empresas/:id',
  authenticateToken,
  authorize('super_admin'),
  asyncHandler(adminController.deleteCompany)
);

// Planes
router.get('/planes', authenticateToken, authorize('super_admin'), asyncHandler(adminController.getPlans));
router.post('/planes', authenticateToken, authorize('super_admin'), asyncHandler(adminController.createPlan));
router.put('/planes/:id', authenticateToken, authorize('super_admin'), asyncHandler(adminController.updatePlan));
router.delete('/planes/:id', authenticateToken, authorize('super_admin'), asyncHandler(adminController.deletePlan));

// Facturación / Pagos
router.get('/pagos', authenticateToken, authorize('super_admin'), asyncHandler(pagoController.getPagos));
router.post('/pagos', authenticateToken, authorize('super_admin'), asyncHandler(pagoController.createPago));
router.put('/pagos/:id', authenticateToken, authorize('super_admin'), asyncHandler(pagoController.updatePago));
router.delete('/pagos/:id', authenticateToken, authorize('super_admin'), asyncHandler(pagoController.deletePago));

// Suscripciones
router.get('/suscripciones', authenticateToken, authorize('super_admin'), asyncHandler(suscripcionController.getSuscripciones));
router.post('/suscripciones', authenticateToken, authorize('super_admin'), asyncHandler(suscripcionController.createSuscripcion));
router.get('/suscripciones/:id', authenticateToken, authorize('super_admin'), asyncHandler(suscripcionController.getSuscripcionById));
router.put('/suscripciones/:id', authenticateToken, authorize('super_admin'), asyncHandler(suscripcionController.updateSuscripcion));
router.get('/empresas/:id/suscripcion', authenticateToken, authorize('super_admin'), asyncHandler(suscripcionController.getSuscripcionByEmpresa));

export default router;