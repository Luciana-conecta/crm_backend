export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.details
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token expired'
    });
  }

  if (err.code) {
    switch (err.code) {
      case '23505':
        return res.status(409).json({
          error: 'Conflict',
          message: 'Resource already exists'
        });
      case '23503': 
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Referenced resource does not exist'
        });
      case '23502': 
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Required field is missing'
        });
    }
  }

  //  genérico
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};