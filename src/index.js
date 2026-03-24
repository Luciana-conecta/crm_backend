import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import empresaRoutes from './routes/empresa.js';
import whatsappRoutes from './routes/whatsapp.js';
import billingRoutes from './routes/billing.js';
import iaRoutes from './routes/ia.js';
import socialRoutes from './routes/social.js';

const app = express();
const PORT = process.env.PORT || 3001;


app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',     
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['Authorization'],
  maxAge: 86400 
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/empresa', empresaRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/ia', iaRoutes);
app.use('/api/social', socialRoutes);
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Insignia CRM Backend is running',
    timestamp: new Date().toISOString()
  });
});
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});
app.listen(PORT, () => {
  console.log(` Running on: http://localhost:${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Health check: http://localhost:${PORT}/health`);
});
process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});