import express from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticateToken } from '../middleware/auth.js';
import authController from '../controllers/authController.js';

const router = express.Router();

// Frena fuerza bruta / credential stuffing contra el login: sin esto no había
// ningún límite de intentos.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Demasiados intentos, probá de nuevo en unos minutos.' },
});

router.post('/login', loginLimiter, asyncHandler(authController.login));
router.post('/refresh', asyncHandler(authController.refreshToken));
router.get('/me', authenticateToken, asyncHandler(authController.getMe));
router.post('/logout', authenticateToken, asyncHandler(authController.logout));
router.post('/change-password', authenticateToken, asyncHandler(authController.changePassword));

export default router;
