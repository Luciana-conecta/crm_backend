import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

const ROLE_MAPPING = {
  'super_admin': 'admin',           
  'admin_empresa': 'client',       
  'usuario_empresa': 'client'      
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ 
      error: 'Bad Request',
      message: 'Email and password are required' 
    });
  }

  try {
    const result = await query(
      'SELECT * FROM usuarios WHERE email = $1 AND estado = $2',
      [email.toLowerCase(), 'activo']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid credentials' 
      });
    }

    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid credentials' 
      });
    }

    const frontendRole = ROLE_MAPPING[user.tipo_usuario] || 'client';

    let userData = {
      id: user.usuarios_id,
      email: user.email,
      name: user.email, // se sobreescribe abajo con nombre de usuario_empresa
      role: frontendRole,
      tipo_usuario: user.tipo_usuario,
    };

    if (user.tipo_usuario !== 'super_admin') {
      const empresasResult = await query(
        `SELECT
          ue.id_empresa,
          ue.nombre,
          ue.apellido,
          e.nombre as empresa_nombre,
          e.nombre_url,
          ue.id_rol,
          ue.rol,
          ue.avatar_url,
          r.nombre as rol_nombre,
          ue.es_principal
        FROM usuario_empresa ue
        JOIN empresas e ON ue.id_empresa = e.empresa_id
        LEFT JOIN roles r ON ue.id_rol = r.id_rol
        WHERE ue.id_usuario = $1 AND ue.estado = 'activo'
        ORDER BY ue.es_principal DESC, e.nombre`,
        [user.usuarios_id]
      );

      if (empresasResult.rows.length === 0) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Usuario no tiene empresa asociada. Contacta al administrador.'
        });
      }

      const principal = empresasResult.rows[0];
      userData.name = `${principal.nombre || ''}${principal.apellido ? ' ' + principal.apellido : ''}`.trim() || user.email;
      userData.empresas = empresasResult.rows;
      userData.empresa_principal = principal;
      userData.empresa_id = principal.id_empresa;
    }

    const accessToken = jwt.sign(
      { 
        id: user.usuarios_id, 
        email: user.email, 
        tipo_usuario: user.tipo_usuario,
        role: frontendRole,              
        empresa_id: userData.empresa_id || null
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { id: user.usuarios_id },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );

    await query(
      'UPDATE usuarios SET updated_at = CURRENT_TIMESTAMP WHERE usuarios_id = $1',
      [user.usuarios_id]
    );

    res.json({
      success: true,
      message: 'Login successful',
      token: accessToken,
      user: userData,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: JWT_EXPIRES_IN
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'An error occurred during login' 
    });
  }
};


const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ 
      error: 'Bad Request',
      message: 'Refresh token is required' 
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    
    const result = await query(
      'SELECT usuarios_id, email, tipo_usuario FROM usuarios WHERE usuarios_id = $1 AND estado = $2',
      [decoded.id, 'activo']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'User not found or inactive' 
      });
    }

    const user = result.rows[0];
    const frontendRole = ROLE_MAPPING[user.tipo_usuario] || 'client';

    const accessToken = jwt.sign(
      { 
        id: user.usuarios_id, 
        email: user.email, 
        tipo_usuario: user.tipo_usuario,
        role: frontendRole
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      tokens: {
        accessToken,
        expiresIn: JWT_EXPIRES_IN
      }
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token' 
      });
    }
    throw error;
  }
};


const getMe = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await query(
      'SELECT usuarios_id, email, tipo_usuario, estado, created_at FROM usuarios WHERE usuarios_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
    }

    const user = result.rows[0];
    const frontendRole = ROLE_MAPPING[user.tipo_usuario] || 'client';
    user.role = frontendRole;
    user.name = user.email;

    // Si es usuario de empresa, obtener nombre real y empresas
    if (user.tipo_usuario !== 'super_admin') {
      const empresasResult = await query(
        `SELECT
          ue.id_empresa,
          ue.nombre,
          ue.apellido,
          ue.avatar_url,
          ue.rol,
          e.nombre as empresa_nombre,
          e.nombre_url,
          ue.id_rol,
          r.nombre as rol_nombre,
          ue.es_principal
        FROM usuario_empresa ue
        JOIN empresas e ON ue.id_empresa = e.empresa_id
        LEFT JOIN roles r ON ue.id_rol = r.id_rol
        WHERE ue.id_usuario = $1 AND ue.estado = 'activo'
        ORDER BY ue.es_principal DESC`,
        [userId]
      );

      const principal = empresasResult.rows[0] || null;
      user.name = principal
        ? `${principal.nombre || ''}${principal.apellido ? ' ' + principal.apellido : ''}`.trim() || user.email
        : user.email;
      user.empresas = empresasResult.rows;
      user.empresa_principal = principal;
      user.empresa_id = principal?.id_empresa || null;
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'An error occurred while fetching user data' 
    });
  }
};


const logout = async (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
};


const changePassword = async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ 
      error: 'Bad Request',
      message: 'Current password and new password are required' 
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ 
      error: 'Bad Request',
      message: 'New password must be at least 8 characters long' 
    });
  }

  try {
    const result = await query(
      'SELECT password FROM usuarios WHERE usuarios_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'User not found' 
      });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Current password is incorrect' 
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await query(
      'UPDATE usuarios SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE usuarios_id = $2',
      [hashedPassword, userId]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'An error occurred while changing password' 
    });
  }
};

export default {
  login,
  refreshToken,
  getMe,
  logout,
  changePassword
};