import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const JWT_SECRET = process.env.JWT_SECRET;
  const authHeader = req.headers.authorization;  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No token provided'
    });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token',
      details: error.message
    });
  }
};

export const authenticate = authenticateToken;

export const authorize = (...allowedTypes) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }

    const hasPermission = allowedTypes.includes(req.user.tipo_usuario);

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required: ${allowedTypes.join(' or ')}`
      });
    }

    next();
  };
};

export const checkEmpresaAccess = async (req, res, next) => {
  const empresaId = req.params.empresaId;
  
  if (req.user.tipo_usuario === 'super_admin') {
    return next();
  }

  if (req.user.empresa_id && req.user.empresa_id == empresaId) {
    return next();
  }

  return res.status(403).json({
    error: 'Forbidden',
    message: 'No tiene acceso a esta empresa'
  });
};