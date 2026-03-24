import bcrypt from 'bcrypt';
import { query } from '../config/database.js';

const getCompanies = async (_req, res) => {
  console.log('[EMPRESAS] Obteniendo listado de todas las empresas');
  try {
    const result = await query(`
      SELECT
        e.*,
        p.nombre as plan_nombre,
        COUNT(DISTINCT ue.id_usuario) as total_usuarios
      FROM empresas e
      LEFT JOIN planes p ON e.plan_id = p.id
      LEFT JOIN usuario_empresa ue ON e.empresa_id = ue.id_empresa
      GROUP BY e.empresa_id, p.nombre
      ORDER BY e.created_at DESC
    `);

    console.log(`[EMPRESAS] Se encontraron ${result.rows.length} empresas`);
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('[EMPRESAS] Error al obtener listado de empresas:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while fetching companies'
    });
  }
};

const getCompanyById = async (req, res) => {
  const { id } = req.params;
  console.log(`[EMPRESAS] Buscando empresa ID: ${id}`);

  const result = await query(
    'SELECT * FROM empresas WHERE empresa_id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    console.log(`[EMPRESAS] Empresa ID: ${id} no encontrada`);
    return res.status(404).json({
      error: 'Not Found',
      message: 'Company not found'
    });
  }

  console.log(`[EMPRESAS] Empresa encontrada: "${result.rows[0].nombre}" (ID: ${id})`);
  res.json({
    success: true,
    data: result.rows[0]
  });
};

const createCompany = async (req, res) => {
  const { nombre, nombre_url, plan_id, logo, color_primario } = req.body;
  console.log(`[EMPRESAS] Creando nueva empresa: "${nombre}" con plan ID: ${plan_id}`);

  const result = await query(
    `INSERT INTO empresas (nombre, nombre_url, plan_id, logo, color_primario)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [nombre, nombre_url, plan_id, logo, color_primario]
  );

  const empresa = result.rows[0];
  console.log(`[EMPRESAS] Empresa creada exitosamente: "${nombre}" (ID: ${empresa.empresa_id})`);

  // Auto-crear suscripción según el plan
  let suscripcion = null;
  if (plan_id) {
    try {
      const planResult = await query('SELECT trial_dias FROM planes WHERE id = $1', [plan_id]);
      if (planResult.rows.length > 0) {
        const { trial_dias } = planResult.rows[0];
        const estadoInicial = trial_dias > 0 ? 'trial' : 'activa';

        let fecha_trial_fin = null;
        if (estadoInicial === 'trial') {
          const ft = new Date();
          ft.setDate(ft.getDate() + trial_dias);
          fecha_trial_fin = ft.toISOString();
        }

        const subResult = await query(
          `INSERT INTO suscripciones (empresa_id, plan_id, estado, fecha_inicio, fecha_trial_fin)
           VALUES ($1, $2, $3, NOW(), $4)
           RETURNING *`,
          [empresa.empresa_id, plan_id, estadoInicial, fecha_trial_fin]
        );
        suscripcion = subResult.rows[0];
        console.log(`[EMPRESAS] Suscripción creada: estado="${estadoInicial}" para empresa ID: ${empresa.empresa_id}`);
      }
    } catch (subError) {
      console.error('[EMPRESAS] Error al crear suscripción automática:', subError.message);
    }
  }

  res.status(201).json({
    success: true,
    message: 'Company created successfully',
    data: { ...empresa, suscripcion }
  });
};

const updateCompany = async (req, res) => {
  const { id } = req.params;
  const { nombre, nombre_url, plan_id, logo, color_primario, estado } = req.body;
  console.log(`[EMPRESAS] Actualizando empresa ID: ${id}`);

  const result = await query(
    `UPDATE empresas
     SET nombre = COALESCE($1, nombre),
         nombre_url = COALESCE($2, nombre_url),
         plan_id = COALESCE($3, plan_id),
         logo = COALESCE($4, logo),
         color_primario = COALESCE($5, color_primario),
         estado = COALESCE($6, estado),
         updated_at = CURRENT_TIMESTAMP
     WHERE empresa_id = $7
     RETURNING *`,
    [nombre, nombre_url, plan_id, logo, color_primario, estado, id]
  );

  if (result.rows.length === 0) {
    console.log(`[EMPRESAS] Empresa ID: ${id} no encontrada`);
    return res.status(404).json({
      error: 'Not Found',
      message: 'Company not found'
    });
  }

  console.log(`[EMPRESAS] Empresa ID: ${id} actualizada exitosamente`);
  res.json({
    success: true,
    message: 'Company updated successfully',
    data: result.rows[0]
  });
};

const deleteCompany = async (req, res) => {
  const { id } = req.params;
  console.log(`[EMPRESAS] Eliminando empresa ID: ${id}`);

  const result = await query(
    'DELETE FROM empresas WHERE empresa_id = $1 RETURNING empresa_id',
    [id]
  );

  if (result.rows.length === 0) {
    console.log(`[EMPRESAS] Empresa ID: ${id} no encontrada`);
    return res.status(404).json({
      error: 'Not Found',
      message: 'Company not found'
    });
  }

  console.log(`[EMPRESAS] Empresa ID: ${id} eliminada exitosamente`);
  res.json({
    success: true,
    message: 'Company deleted successfully'
  });
};

const getPlans = async (_req, res) => {
  console.log('[PLANES] Obteniendo listado de todos los planes');

  const result = await query(`
    SELECT
      p.*,
      COUNT(e.empresa_id) as empresas_count
    FROM planes p
    LEFT JOIN empresas e ON p.id = e.plan_id
    GROUP BY p.id
    ORDER BY p.precio ASC
  `);

  console.log(`[PLANES] Se encontraron ${result.rows.length} planes`);
  res.json({
    success: true,
    data: result.rows
  });
};

const getPlanById = async (req, res) => {
  const { id } = req.params;
  console.log(`[PLANES] Buscando plan ID: ${id}`);

  const result = await query(
    'SELECT * FROM planes WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    console.log(`[PLANES] Plan ID: ${id} no encontrado`);
    return res.status(404).json({
      error: 'Not Found',
      message: 'Plan not found'
    });
  }

  console.log(`[PLANES] Plan encontrado: "${result.rows[0].nombre}" (ID: ${id})`);
  res.json({
    success: true,
    data: result.rows[0]
  });
};

const createPlan = async (req, res) => {
  const { nombre, descripcion, precio, max_usuarios, max_clientes, max_canales, caracteristicas } = req.body;
  console.log(`[PLANES] Creando nuevo plan: "${nombre}" con precio: ${precio}`);

  const result = await query(
    `INSERT INTO planes (
      nombre, descripcion, precio, max_usuarios, max_clientes,
      max_canales, caracteristicas
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [nombre, descripcion, precio, max_usuarios, max_clientes, max_canales, caracteristicas]
  );

  console.log(`[PLANES] Plan creado exitosamente: "${nombre}" (ID: ${result.rows[0].id})`);
  res.status(201).json({
    success: true,
    message: 'Plan created successfully',
    data: result.rows[0]
  });
};

const updatePlan = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, precio, max_usuarios, max_clientes, max_canales, caracteristicas } = req.body;
  console.log(`[PLANES] Actualizando plan ID: ${id}`);

  const result = await query(
    `UPDATE planes
     SET nombre = COALESCE($1, nombre),
         descripcion = COALESCE($2, descripcion),
         precio = COALESCE($3, precio),
         max_usuarios = COALESCE($4, max_usuarios),
         max_clientes = COALESCE($5, max_clientes),
         max_canales = COALESCE($6, max_canales),
         caracteristicas = COALESCE($7, caracteristicas),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $8
     RETURNING *`,
    [nombre, descripcion, precio, max_usuarios, max_clientes, max_canales, caracteristicas, id]
  );

  if (result.rows.length === 0) {
    console.log(`[PLANES] Plan ID: ${id} no encontrado`);
    return res.status(404).json({
      error: 'Not Found',
      message: 'Plan not found'
    });
  }

  console.log(`[PLANES] Plan ID: ${id} actualizado exitosamente`);
  res.json({
    success: true,
    message: 'Plan updated successfully',
    data: result.rows[0]
  });
};

const deletePlan = async (req, res) => {
  const { id } = req.params;
  console.log(`[PLANES] Eliminando plan ID: ${id}`);

  const result = await query(
    'DELETE FROM planes WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    console.log(`[PLANES] Plan ID: ${id} no encontrado`);
    return res.status(404).json({
      error: 'Not Found',
      message: 'Plan not found'
    });
  }

  console.log(`[PLANES] Plan ID: ${id} eliminado exitosamente`);
  res.json({
    success: true,
    message: 'Plan deleted successfully'
  });
};

const getUsers = async (_req, res) => {
  console.log('[USUARIOS] Obteniendo listado de todos los usuarios');

  const result = await query(`
    SELECT
      u.usuarios_id, u.email, u.tipo_usuario, u.estado, u.created_at,
      COUNT(DISTINCT ue.id_empresa) as empresas_count
    FROM usuarios u
    LEFT JOIN usuario_empresa ue ON u.usuarios_id = ue.id_usuario
    GROUP BY u.usuarios_id
    ORDER BY u.created_at DESC
  `);

  console.log(`[USUARIOS] Se encontraron ${result.rows.length} usuarios`);
  res.json({
    success: true,
    data: result.rows
  });
};

const getUserById = async (req, res) => {
  const { id } = req.params;
  console.log(`[USUARIOS] Buscando usuario ID: ${id}`);

  const result = await query(
    'SELECT usuarios_id, email, tipo_usuario, estado, created_at FROM usuarios WHERE usuarios_id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    console.log(`[USUARIOS] Usuario ID: ${id} no encontrado`);
    return res.status(404).json({
      error: 'Not Found',
      message: 'User not found'
    });
  }

  console.log(`[USUARIOS] Usuario encontrado: "${result.rows[0].email}" (ID: ${id})`);
  res.json({
    success: true,
    data: result.rows[0]
  });
};

const createUser = async (req, res) => {
  const { email, password, tipo_usuario, nombre } = req.body;
  console.log(`[USUARIOS] Creando usuario: "${email}" con rol: ${tipo_usuario}`);

  if (!email || !password || !tipo_usuario) {
    console.log('[USUARIOS] Error: campos requeridos faltantes al crear usuario');
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Email, password, and tipo_usuario are required'
    });
  }

  if (password.length < 8) {
    console.log(`[USUARIOS] Error: password demasiado corta para usuario "${email}"`);
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Password must be at least 8 characters long'
    });
  }

  const validTipos = ['super_admin', 'admin_empresa', 'usuario_empresa'];
  if (!validTipos.includes(tipo_usuario)) {
    console.log(`[USUARIOS] Error: tipo_usuario inválido "${tipo_usuario}"`);
    return res.status(400).json({
      error: 'Bad Request',
      message: `tipo_usuario must be one of: ${validTipos.join(', ')}`
    });
  }

  try {
    const existingUser = await query(
      'SELECT usuarios_id FROM usuarios WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      console.log(`[USUARIOS] Email "${email}" ya existe en el sistema`);
      return res.status(409).json({
        error: 'Conflict',
        message: 'Email already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO usuarios (email, password, tipo_usuario, nombre, estado)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING usuarios_id, email, tipo_usuario, nombre, estado, created_at`,
      [email.toLowerCase(), hashedPassword, tipo_usuario, nombre || email, 'activo']
    );

    console.log(`[USUARIOS] Usuario creado exitosamente: "${email}" (ID: ${result.rows[0].usuarios_id})`);
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error(`[USUARIOS] Error al crear usuario "${email}":`, error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while creating the user'
    });
  }
};

const updateUser = async (req, res) => {
  const { id } = req.params;
  const { email, password, tipo_usuario, nombre, estado } = req.body;
  console.log(`[USUARIOS] Actualizando usuario ID: ${id}`);

  try {
    if (tipo_usuario) {
      const validTipos = ['super_admin', 'admin_empresa', 'usuario_empresa'];
      if (!validTipos.includes(tipo_usuario)) {
        console.log(`[USUARIOS] Error: tipo_usuario inválido "${tipo_usuario}" para usuario ID: ${id}`);
        return res.status(400).json({
          error: 'Bad Request',
          message: `tipo_usuario must be one of: ${validTipos.join(', ')}`
        });
      }
    }

    if (password && password.length < 8) {
      console.log(`[USUARIOS] Error: password demasiado corta para usuario ID: ${id}`);
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Password must be at least 8 characters long'
      });
    }

    if (email) {
      const existingUser = await query(
        'SELECT usuarios_id FROM usuarios WHERE email = $1 AND usuarios_id != $2',
        [email.toLowerCase(), id]
      );

      if (existingUser.rows.length > 0) {
        console.log(`[USUARIOS] Email "${email}" ya está en uso por otro usuario`);
        return res.status(409).json({
          error: 'Conflict',
          message: 'Email already exists'
        });
      }
    }

    let hashedPassword = null;
    if (password) {
      console.log(`[USUARIOS] Actualizando contraseña para usuario ID: ${id}`);
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const result = await query(
      `UPDATE usuarios
       SET email = COALESCE($1, email),
           password = COALESCE($2, password),
           tipo_usuario = COALESCE($3, tipo_usuario),
           nombre = COALESCE($4, nombre),
           estado = COALESCE($5, estado),
           updated_at = CURRENT_TIMESTAMP
       WHERE usuarios_id = $6
       RETURNING usuarios_id, email, tipo_usuario, nombre, estado, created_at`,
      [email?.toLowerCase(), hashedPassword, tipo_usuario, nombre, estado, id]
    );

    if (result.rows.length === 0) {
      console.log(`[USUARIOS] Usuario ID: ${id} no encontrado`);
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
    }

    console.log(`[USUARIOS] Usuario ID: ${id} actualizado exitosamente`);
    res.json({
      success: true,
      message: 'User updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error(`[USUARIOS] Error al actualizar usuario ID: ${id}:`, error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while updating the user'
    });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;
  console.log(`[USUARIOS] Eliminando (inactivando) usuario ID: ${id}`);

  try {
    const result = await query(
      `UPDATE usuarios
       SET estado = 'inactivo',
           updated_at = CURRENT_TIMESTAMP
       WHERE usuarios_id = $1
       RETURNING usuarios_id`,
      [id]
    );

    if (result.rows.length === 0) {
      console.log(`[USUARIOS] Usuario ID: ${id} no encontrado`);
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
    }

    console.log(`[USUARIOS] Usuario ID: ${id} inactivado exitosamente`);
    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error(`[USUARIOS] Error al eliminar usuario ID: ${id}:`, error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while deleting the user'
    });
  }
};

const getStats = async (_req, res) => {
  console.log('[STATS] Obteniendo estadísticas globales del sistema');

  const [empresas, usuarios, clientes] = await Promise.all([
    query('SELECT COUNT(*) as total FROM empresas WHERE estado = $1', ['activo']),
    query('SELECT COUNT(*) as total FROM usuarios WHERE estado = $1', ['activo']),
    query('SELECT COUNT(*) as total FROM clientes WHERE estado = $1', ['activo'])
  ]);

  console.log(`[STATS] Estadísticas globales — empresas: ${empresas.rows[0].total}, usuarios: ${usuarios.rows[0].total}, clientes: ${clientes.rows[0].total}`);
  res.json({
    success: true,
    data: {
      empresas_activas: parseInt(empresas.rows[0].total),
      usuarios_activos: parseInt(usuarios.rows[0].total),
      clientes_totales: parseInt(clientes.rows[0].total)
    }
  });
};

export default {
  getCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
  getPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getStats
};
