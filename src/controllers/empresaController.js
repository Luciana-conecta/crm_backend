import { query } from '../config/database.js';
import bcrypt from 'bcrypt';
import { sendWelcomeEmail } from '../service/emailService.js';

// ============================================
// CLIENTES
// ============================================

const getClientes = async (req, res) => {
  const empresaId = req.params.empresaId;
  console.log(`[CLIENTES] Obteniendo clientes de empresa ID: ${empresaId}`);

  const result = await query(
    `SELECT * FROM clientes
     WHERE id_empresa = $1 AND estado = 'activo'
     ORDER BY nombre ASC`,
    [empresaId]
  );

  console.log(`[CLIENTES] Se encontraron ${result.rows.length} clientes para empresa ID: ${empresaId}`);
  res.json({
    success: true,
    data: result.rows
  });
};

const getClienteById = async (req, res) => {
  const { empresaId, id } = req.params;
  console.log(`[CLIENTES] Buscando cliente ID: ${id} en empresa ID: ${empresaId}`);

  const result = await query(
    `SELECT * FROM clientes
     WHERE id = $1 AND id_empresa = $2`,
    [id, empresaId]
  );

  if (result.rows.length === 0) {
    console.log(`[CLIENTES] Cliente ID: ${id} no encontrado en empresa ID: ${empresaId}`);
    return res.status(404).json({
      error: 'Not Found',
      message: 'Cliente not found'
    });
  }

  console.log(`[CLIENTES] Cliente encontrado: ${result.rows[0].nombre} (ID: ${id})`);
  res.json({
    success: true,
    data: result.rows[0]
  });
};

const createCliente = async (req, res) => {
  const empresaId = req.params.empresaId;
  const { nombre, telefono, email, notas, etiquetas } = req.body;
  console.log(`[CLIENTES] Creando cliente "${nombre}" en empresa ID: ${empresaId}`);

  if (!nombre) {
    console.log(`[CLIENTES] Error: nombre requerido para crear cliente en empresa ID: ${empresaId}`);
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Nombre is required'
    });
  }

  try {
    const result = await query(
      `INSERT INTO clientes (id_empresa, nombre, telefono, email, notas, etiquetas, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'activo')
       RETURNING *`,
      [empresaId, nombre, telefono, email, notas, etiquetas ? JSON.stringify(etiquetas) : null]
    );

    console.log(`[CLIENTES] Cliente creado exitosamente: "${nombre}" (ID: ${result.rows[0].id}) en empresa ID: ${empresaId}`);
    res.status(201).json({
      success: true,
      message: 'Cliente created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error(`[CLIENTES] Error al crear cliente "${nombre}" en empresa ID: ${empresaId}:`, error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while creating the cliente'
    });
  }
};

const updateCliente = async (req, res) => {
  const { empresaId, id } = req.params;
  const { nombre, telefono, email, notas, etiquetas, estado } = req.body;
  console.log(`[CLIENTES] Actualizando cliente ID: ${id} en empresa ID: ${empresaId}`);

  try {
    const result = await query(
      `UPDATE clientes
       SET nombre = COALESCE($1, nombre),
           telefono = COALESCE($2, telefono),
           email = COALESCE($3, email),
           notas = COALESCE($4, notas),
           etiquetas = COALESCE($5, etiquetas),
           estado = COALESCE($6, estado),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND id_empresa = $8
       RETURNING *`,
      [nombre, telefono, email, notas, etiquetas ? JSON.stringify(etiquetas) : null, estado, id, empresaId]
    );

    if (result.rows.length === 0) {
      console.log(`[CLIENTES] Cliente ID: ${id} no encontrado en empresa ID: ${empresaId}`);
      return res.status(404).json({
        error: 'Not Found',
        message: 'Cliente not found'
      });
    }

    console.log(`[CLIENTES] Cliente ID: ${id} actualizado exitosamente en empresa ID: ${empresaId}`);
    res.json({
      success: true,
      message: 'Cliente updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error(`[CLIENTES] Error al actualizar cliente ID: ${id} en empresa ID: ${empresaId}:`, error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while updating the cliente'
    });
  }
};

const deleteCliente = async (req, res) => {
  const { empresaId, id } = req.params;
  console.log(`[CLIENTES] Eliminando (inactivando) cliente ID: ${id} en empresa ID: ${empresaId}`);

  try {
    const result = await query(
      `UPDATE clientes SET estado = 'inactivo', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND id_empresa = $2
       RETURNING id`,
      [id, empresaId]
    );

    if (result.rows.length === 0) {
      console.log(`[CLIENTES] Cliente ID: ${id} no encontrado en empresa ID: ${empresaId}`);
      return res.status(404).json({
        error: 'Not Found',
        message: 'Cliente not found'
      });
    }

    console.log(`[CLIENTES] Cliente ID: ${id} inactivado exitosamente en empresa ID: ${empresaId}`);
    res.json({
      success: true,
      message: 'Cliente deleted successfully'
    });
  } catch (error) {
    console.error(`[CLIENTES] Error al eliminar cliente ID: ${id} en empresa ID: ${empresaId}:`, error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while deleting the cliente'
    });
  }
};

// ============================================
// CONTACTOS
// ============================================

const getContactos = async (req, res) => {
  const { empresaId } = req.params;
  const { clienteId } = req.query;

  const values = [empresaId];
  let whereClause = 'WHERE empresa_id = $1';

  if (clienteId) {
    values.push(clienteId);
    whereClause += ` AND id_cliente = $${values.length}`;
  }

  console.log(`[CONTACTOS] Obteniendo contactos de empresa ID: ${empresaId}${clienteId ? `, cliente ID: ${clienteId}` : ''}`);

  const result = await query(
    `SELECT * FROM contactos ${whereClause} ORDER BY nombre ASC`,
    values
  );

  console.log(`[CONTACTOS] Se encontraron ${result.rows.length} contactos`);
  res.json({ success: true, data: result.rows });
};

const getAllContactosByEmpresa = getContactos;

const getContactoById = async (req, res) => {
  const { empresaId, id } = req.params;
  console.log(`[CONTACTOS] Buscando contacto ID: ${id} en empresa ID: ${empresaId}`);

  const result = await query(
    `SELECT * FROM contactos WHERE id_contactos = $1 AND empresa_id = $2`,
    [id, empresaId]
  );

  if (result.rows.length === 0) {
    console.log(`[CONTACTOS] Contacto ID: ${id} no encontrado`);
    return res.status(404).json({ error: 'Not Found', message: 'Contacto not found' });
  }

  console.log(`[CONTACTOS] Contacto encontrado: ${result.rows[0].nombre}`);
  res.json({ success: true, data: result.rows[0] });
};

const createContacto = async (req, res) => {
  const { empresaId } = req.params;
  const { nombre, email, telefono, id_cliente } = req.body;
  console.log(`[CONTACTOS] Creando contacto "${nombre}" en empresa ID: ${empresaId}`);

  if (!nombre || !telefono) {
    return res.status(400).json({ error: 'Bad Request', message: 'Nombre y telefono son requeridos' });
  }

  try {
    const result = await query(
      `INSERT INTO contactos (empresa_id, id_cliente, numero_telefono, nombre, email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [empresaId, id_cliente || null, telefono, nombre, email || null]
    );

    console.log(`[CONTACTOS] Contacto creado: "${nombre}" (ID: ${result.rows[0].id_contactos})`);
    res.status(201).json({ success: true, message: 'Contacto created successfully', data: result.rows[0] });
  } catch (error) {
    console.error(`[CONTACTOS] Error al crear contacto:`, error);
    res.status(500).json({ error: 'Internal Server Error', message: 'An error occurred while creating the contacto' });
  }
};

const updateContacto = async (req, res) => {
  const { empresaId, id } = req.params;
  const { nombre, email, numero_telefono } = req.body;
  console.log(`[CONTACTOS] Actualizando contacto ID: ${id} en empresa ID: ${empresaId}`);

  try {
    const result = await query(
      `UPDATE contactos
       SET nombre = COALESCE($1, nombre),
           email = COALESCE($2, email),
           numero_telefono = COALESCE($3, numero_telefono)
       WHERE id_contactos = $4 AND empresa_id = $5
       RETURNING *`,
      [nombre, email, numero_telefono, id, empresaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Contacto not found' });
    }

    console.log(`[CONTACTOS] Contacto ID: ${id} actualizado`);
    res.json({ success: true, message: 'Contacto updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error(`[CONTACTOS] Error al actualizar contacto ID: ${id}:`, error);
    res.status(500).json({ error: 'Internal Server Error', message: 'An error occurred while updating the contacto' });
  }
};

const deleteContacto = async (req, res) => {
  const { empresaId, id } = req.params;
  console.log(`[CONTACTOS] Eliminando contacto ID: ${id} en empresa ID: ${empresaId}`);

  try {
    const result = await query(
      `DELETE FROM contactos WHERE id_contactos = $1 AND empresa_id = $2 RETURNING id_contactos`,
      [id, empresaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Contacto not found' });
    }

    console.log(`[CONTACTOS] Contacto ID: ${id} eliminado`);
    res.json({ success: true, message: 'Contacto deleted successfully' });
  } catch (error) {
    console.error(`[CONTACTOS] Error al eliminar contacto ID: ${id}:`, error);
    res.status(500).json({ error: 'Internal Server Error', message: 'An error occurred while deleting the contacto' });
  }
};

// ============================================
// LOGO DE EMPRESA
// ============================================

const updateEmpresaLogo = async (req, res) => {
  const { id } = req.params;
  const { logo } = req.body;
  console.log(`[EMPRESA] Actualizando logo de empresa ID: ${id}`);

  if (!logo || !logo.trim()) {
    console.log(`[EMPRESA] Error: logo URL requerido para empresa ID: ${id}`);
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Logo URL is required'
    });
  }

  try {
    const result = await query(
      `UPDATE empresas
       SET logo = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE empresa_id = $2
       RETURNING empresa_id, logo`,
      [logo.trim(), id]
    );

    if (result.rows.length === 0) {
      console.log(`[EMPRESA] Empresa ID: ${id} no encontrada al actualizar logo`);
      return res.status(404).json({
        error: 'Not Found',
        message: 'Empresa not found'
      });
    }

    console.log(`[EMPRESA] Logo actualizado exitosamente para empresa ID: ${id}`);
    res.json({
      success: true,
      message: 'Logo updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error(`[EMPRESA] Error al actualizar logo de empresa ID: ${id}:`, error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while updating the logo'
    });
  }
};

// ============================================
// DASHBOARD/ESTADÍSTICAS DE EMPRESA
// ============================================

const getEmpresaStats = async (req, res) => {
  const empresaId = req.params.empresaId;
  try {
    const [clientes, contactos, conversaciones, mensajes] = await Promise.all([
      query('SELECT COUNT(*) as total FROM clientes WHERE id_empresa = $1 AND estado = $2', [empresaId, 'activo']),
      query('SELECT COUNT(*) as total FROM contactos WHERE id_cliente IN (SELECT id FROM clientes WHERE id_empresa = $1) AND estado = $2', [empresaId, 'activo']),
      query('SELECT COUNT(*) as total FROM conversaciones WHERE id_empresa = $1', [empresaId]),
      query('SELECT COUNT(*) as total FROM mensajes WHERE id_conversacion IN (SELECT id FROM conversaciones WHERE id_empresa = $1)', [empresaId])
    ]);

    console.log(`[STATS] Estadísticas de empresa ID: ${empresaId} — clientes: ${clientes.rows[0].total}, contactos: ${contactos.rows[0].total}, conversaciones: ${conversaciones.rows[0].total}, mensajes: ${mensajes.rows[0].total}`);
    res.json({
      success: true,
      data: {
        clientes_activos: parseInt(clientes.rows[0].total),
        contactos_activos: parseInt(contactos.rows[0].total),
        conversaciones_totales: parseInt(conversaciones.rows[0].total),
        mensajes_totales: parseInt(mensajes.rows[0].total)
      }
    });
  } catch (error) {
    console.error(`[STATS] Error al obtener estadísticas de empresa ID: ${empresaId}:`, error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while fetching stats'
    });
  }
};
//usuarios por empresa
const getUserEmpresa = async (req, res) => {
  const { empresaId, clienteId } = req.params;

  const result = await query(
    `SELECT * FROM usuario_empresa
     WHERE id_empresa = $1
     ORDER BY nombre ASC`,
    [empresaId]
  );

  console.log(`[USUARIOS] Se encontraron ${result.rows.length} usuarios para empresa ID: ${empresaId}`);
  res.json({
    success: true,
    data: result.rows
  });
};

const getAllUserByEmpresa = async (req, res) => {
  const empresaId = req.params.empresaId;
  console.log(`[USUARIOS] Obteniendo todos los usuarios de empresa ID: ${empresaId}`);

  const result = await query(
    `SELECT id_user_empre AS id, id_usuario, nombre, apellido, email, telefono,
            rol, id_rol, estado, avatar_url, notas, etiquetas, created_at
     FROM usuario_empresa
     WHERE id_empresa = $1
     ORDER BY nombre ASC`,
    [empresaId]
  );

  console.log(`[USUARIOS] Se encontraron ${result.rows.length} usuarios en empresa ID: ${empresaId}`);
  res.json({
    success: true,
    data: result.rows
  });
};

const getUserById = async (req, res) => {
  const { empresaId, id } = req.params;
  console.log(`[USUARIOS] Buscando usuario ID: ${id} en empresa ID: ${empresaId}`);

  const result = await query(
    `SELECT id_user_empre AS id, id_usuario, nombre, apellido, email, telefono,
            rol, id_rol, estado, avatar_url, notas, etiquetas, created_at
     FROM usuario_empresa
     WHERE id_user_empre = $1 AND id_empresa = $2`,
    [id, empresaId]
  );

  if (result.rows.length === 0) {
    console.log(`[USUARIOS] Usuario ID: ${id} no encontrado`);
    return res.status(404).json({
      error: 'Not Found',
      message: 'Usuario not found'
    });
  }

  console.log(`[USUARIOS] Usuario encontrado: ${result.rows[0].nombre} (ID: ${id})`);
  res.json({
    success: true,
    data: result.rows[0]
  });
};

const createUser = async (req, res) => {
  const { empresaId } = req.params;
  const { nombre, apellido, email, telefono, rol, avatar_url, notas } = req.body;

  if (!nombre || !email) {
    return res.status(400).json({ error: 'nombre y email son requeridos' });
  }

  try {
    // Verificar límite de usuarios del plan
    const planCheck = await query(
      `SELECT p.max_usuarios, COUNT(ue.id_user_empre) as current_users
       FROM empresas e
       JOIN planes p ON e.plan_id = p.id
       LEFT JOIN usuario_empresa ue ON e.empresa_id = ue.id_empresa AND ue.estado = 'activo'
       WHERE e.empresa_id = $1
       GROUP BY p.max_usuarios`,
      [empresaId]
    );
    if (planCheck.rows.length > 0) {
      const { max_usuarios, current_users } = planCheck.rows[0];
      if (max_usuarios && parseInt(current_users) >= parseInt(max_usuarios)) {
        return res.status(403).json({
          error: `Tu plan permite máximo ${max_usuarios} usuario(s). Actualiza tu plan para agregar más.`
        });
      }
    }

    // Verificar que el email no exista ya
    const emailCheck = await query(
      'SELECT usuarios_id FROM usuarios WHERE email = $1',
      [email.toLowerCase()]
    );
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ error: 'El email ya esta registrado' });
    }

    // Generar contraseña aleatoria
    const plainPassword = Math.random().toString(36).slice(-6) + Math.random().toString(36).slice(-4).toUpperCase() + '!';

    // Hashear contraseña
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // Crear en tabla usuarios (para login)
    const usuarioResult = await query(
      `INSERT INTO usuarios (email, password, tipo_usuario, estado)
       VALUES ($1, $2, 'usuario_empresa', 'activo')
       RETURNING usuarios_id`,
      [email.toLowerCase(), hashedPassword]
    );
    const usuarioId = usuarioResult.rows[0].usuarios_id;

    // Obtener id_rol desde la tabla roles (busca por nombre, si no existe toma el primero)
    const rolNombre = rol ?? 'Agente';
    const rolResult = await query(
      `SELECT id_rol FROM roles WHERE nombre ILIKE $1 LIMIT 1`,
      [rolNombre]
    );
    let idRol;
    if (rolResult.rows.length > 0) {
      idRol = rolResult.rows[0].id_rol;
    } else {
      const defaultRol = await query(`SELECT id_rol FROM roles ORDER BY id_rol ASC LIMIT 1`);
      if (defaultRol.rows.length === 0) {
        return res.status(500).json({ error: 'No hay roles configurados en el sistema' });
      }
      idRol = defaultRol.rows[0].id_rol;
    }

    // Vincular usuario a la empresa con todos los campos
    const result = await query(
      `INSERT INTO usuario_empresa
         (id_usuario, id_empresa, estado, es_principal, nombre, apellido, email, telefono, rol, id_rol, avatar_url, notas)
       VALUES ($1, $2, 'activo', true, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id_user_empre AS id, nombre, apellido, email, telefono, rol, id_rol, estado, avatar_url, notas`,
      [usuarioId, empresaId, nombre, apellido ?? null, email.toLowerCase(), telefono ?? null, rolNombre, idRol, avatar_url ?? null, notas ?? null]
    );

    // Enviar email con credenciales
    try {
      const empresaResult = await query('SELECT nombre FROM empresas WHERE empresa_id = $1', [empresaId]);
      const empresaNombre = empresaResult.rows[0]?.nombre || '';
      await sendWelcomeEmail(email, nombre, plainPassword, empresaNombre);
    } catch (emailError) {
      console.error('[TEAM] Error al enviar email de bienvenida:', emailError.message);
    }

    console.log(`[TEAM] Usuario creado: ${email} (ID: ${usuarioId})`);
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[TEAM] Error al crear miembro:', error);
    res.status(500).json({ error: 'Error al crear miembro del equipo' });
  }
};

const updateUser = async (req, res) => {
  const { empresaId, id } = req.params;
  const { nombre, apellido, telefono, email, rol, avatar_url, estado, notas, etiquetas } = req.body;
  console.log(`[USUARIOS] Actualizando usuario ID: ${id} en empresa ID: ${empresaId}`);

  try {
    const result = await query(
      `UPDATE usuario_empresa
       SET nombre     = COALESCE($1, nombre),
           apellido   = COALESCE($2, apellido),
           telefono   = COALESCE($3, telefono),
           email      = COALESCE($4, email),
           rol        = COALESCE($5, rol),
           avatar_url = COALESCE($6, avatar_url),
           estado     = COALESCE($7, estado),
           notas      = COALESCE($8, notas),
           etiquetas  = COALESCE($9, etiquetas),
           updated_at = NOW()
       WHERE id_user_empre = $10 AND id_empresa = $11
       RETURNING id_user_empre AS id, nombre, apellido, email, telefono, rol, estado, avatar_url, notas, etiquetas`,
      [nombre, apellido, telefono, email, rol, avatar_url, estado, notas, etiquetas, id, empresaId]
    );

    if (result.rows.length === 0) {
      console.log(`[USUARIOS] Usuario ID: ${id} no encontrado`);
      return res.status(404).json({
        error: 'Not Found',
        message: 'Usuario not found'
      });
    }

    console.log(`[USUARIOS] Usuario ID: ${id} actualizado exitosamente`);
    res.json({
      success: true,
      message: 'Usuario updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error(`[USUARIOS] Error al actualizar usuario ID: ${id}:`, error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while updating the usuario'
    });
  }
};

const deleteUser = async (req, res) => {
  const { empresaId, id } = req.params;
  console.log(`[USUARIOS] Eliminando (inactivando) usuario ID: ${id} en empresa ID: ${empresaId}`);

  try {
    const result = await query(
      `UPDATE usuario_empresa
       SET estado = 'inactivo', updated_at = NOW()
       WHERE id_user_empre = $1 AND id_empresa = $2
       RETURNING id_user_empre`,
      [id, empresaId]
    );

    if (result.rows.length === 0) {
      console.log(`[USUARIOS] Usuario ID: ${id} no encontrado`);
      return res.status(404).json({
        error: 'Not Found',
        message: 'Usuario not found'
      });
    }

    console.log(`[USUARIOS] Usuario ID: ${id} inactivado exitosamente`);
    res.json({
      success: true,
      message: 'Usuario deleted successfully'
    });
  } catch (error) {
    console.error(`[USUARIOS] Error al eliminar usuario ID: ${id}:`, error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while deleting the usuario'
    });
  }
};

export default {
  getClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente,
  getContactos,
  getAllContactosByEmpresa,
  getContactoById,
  createContacto,
  updateContacto,
  deleteContacto,
  updateEmpresaLogo,
  getEmpresaStats, 
  getUserEmpresa,
  getAllUserByEmpresa,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};
