import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticateToken } from '../middleware/auth.js';
import authController from '../controllers/authController.js';

const router = express.Router();

router.post('/login', asyncHandler(authController.login));
router.post('/refresh', asyncHandler(authController.refreshToken));
router.get('/me', authenticateToken, asyncHandler(authController.getMe));
router.post('/logout', authenticateToken, asyncHandler(authController.logout));
router.post('/change-password', authenticateToken, asyncHandler(authController.changePassword));

export default router;
