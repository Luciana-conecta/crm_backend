import { WebSocketServer } from 'ws';

let wss;
const clientes = new Map();

export function inicializarWebSocket(server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const params = new URLSearchParams(req.url.split('?')[1]);
    const empresaId = params.get('empresaId');

    if (!empresaId) {
      ws.close();
      return;
    }

    if (!clientes.has(empresaId)) {
      clientes.set(empresaId, new Set());
    }
    clientes.get(empresaId).add(ws);

    console.log(`✅ Cliente conectado - Empresa: ${empresaId}`);

    ws.on('close', () => {
      clientes.get(empresaId)?.delete(ws);
      console.log(`❌ Cliente desconectado - Empresa: ${empresaId}`);
    });

    ws.on('error', (error) => {
      console.error('Error en WebSocket:', error);
    });
  });

  return wss;
}

export function notificarNuevoMensaje(empresaId, data) {
  const clientesEmpresa = clientes.get(empresaId.toString());
  
  if (clientesEmpresa) {
    const mensaje = JSON.stringify({
      tipo: 'nuevo_mensaje',
      ...data
    });

    clientesEmpresa.forEach((cliente) => {
      if (cliente.readyState === 1) { 
        cliente.send(mensaje);
      }
    });

    console.log(`📤 Notificación enviada a ${clientesEmpresa.size} clientes`);
  }
}

export function notificarActualizacionMensaje(empresaId, data) {
  const clientesEmpresa = clientes.get(empresaId.toString());
  
  if (clientesEmpresa) {
    const mensaje = JSON.stringify({
      tipo: 'actualizacion_mensaje',
      ...data
    });

    clientesEmpresa.forEach((cliente) => {
      if (cliente.readyState === 1) {
        cliente.send(mensaje);
      }
    });
  }
}