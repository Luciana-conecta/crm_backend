import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import empresaController from '../controllers/empresaController.js';

const router = express.Router();

router.use(authenticateToken);

// Roles disponibles (para poblar selects en el frontend)
router.get('/roles', asyncHandler(async (req, res) => {
  const { query } = await import('../config/database.js');
  const result = await query(`SELECT id_rol AS id, nombre FROM roles ORDER BY nombre ASC`);
  res.json({ success: true, data: result.rows });
}));

router.put('/:id/logo', asyncHandler(empresaController.updateEmpresaLogo));
router.get('/:empresaId/stats', asyncHandler(empresaController.getEmpresaStats));
router.get('/:empresaId/clientes', asyncHandler(empresaController.getClientes));
router.post('/:empresaId/clientes', asyncHandler(empresaController.createCliente));
router.get('/:empresaId/clientes/:id', asyncHandler(empresaController.getClienteById));
router.put('/:empresaId/clientes/:id', asyncHandler(empresaController.updateCliente));
router.delete('/:empresaId/clientes/:id', asyncHandler(empresaController.deleteCliente));
router.get('/:empresaId/contactos', asyncHandler(empresaController.getContactos));
router.post('/:empresaId/contactos', asyncHandler(empresaController.createContacto));
router.get('/:empresaId/contactos/:id', asyncHandler(empresaController.getContactoById));
router.put('/:empresaId/contactos/:id', asyncHandler(empresaController.updateContacto));
router.delete('/:empresaId/contactos/:id', asyncHandler(empresaController.deleteContacto));
router.get('/:empresaId/user', asyncHandler(empresaController.getAllUserByEmpresa));
router.get('/:empresaId/user/:id', asyncHandler(empresaController.getUserById));
router.post('/:empresaId/user', asyncHandler(empresaController.createUser));
router.put('/:empresaId/user/:id', asyncHandler(empresaController.updateUser));
router.delete('/:empresaId/user/:id', asyncHandler(empresaController.deleteUser));

export default router;
