import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import empresaRoutes from './routes/empresa.js';
import whatsappRoutes from './routes/whatsapp.js';
import billingRoutes from './routes/billing.js';
import iaRoutes from './routes/ia.js';
import socialRoutes from './routes/social.js';
import { restaurarSesiones, cerrarTodosLosSockets } from './service/baileysService.js';
import { inicializarWebSocket } from './service/websocketService.js';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Necesario para que req.protocol refleje https cuando el server corre detrás de un
// proxy/balanceador (usado para armar el link de documentos que Meta descarga).
app.set('trust proxy', 1);


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
inicializarWebSocket(server);

server.listen(PORT, () => {
  console.log(` Running on: http://localhost:${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Health check: http://localhost:${PORT}/health`);
  restaurarSesiones();
});
// Cerrar los sockets de WhatsApp antes de salir: evita que, durante un
// restart (nodemon, deploy, crash-restart), el proceso viejo y el nuevo
// queden con la misma sesión conectada a la vez y cada uno responda por
// su cuenta al mismo mensaje entrante (la IA "duplicándose").
function apagar() {
  cerrarTodosLosSockets();
  process.exit(0);
}

process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);