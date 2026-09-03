import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MEDIA_DIR = path.resolve(process.cwd(), 'uploads', 'whatsapp');

function extensionDeMime(mimetype) {
  if (!mimetype) return 'bin';
  const sub = mimetype.split(';')[0].split('/')[1] || 'bin';
  return sub.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
}

// Guarda un buffer de media (audio, imagen, video, documento, sticker) recibido
// por WhatsApp y devuelve la ruta de la API para servirlo (ver rutas de whatsapp.js).
export function guardarMedia(empresaId, buffer, mimetype, nombreSugerido) {
  const dir = path.join(MEDIA_DIR, String(empresaId));
  fs.mkdirSync(dir, { recursive: true });

  const extNombre = nombreSugerido ? path.extname(nombreSugerido).slice(1) : '';
  const ext = extNombre || extensionDeMime(mimetype);
  const filename = `${randomUUID()}${ext ? '.' + ext : ''}`;

  fs.writeFileSync(path.join(dir, filename), buffer);
  return `/api/whatsapp/media/${empresaId}/${filename}`;
}

// Resuelve la ruta absoluta en disco de un archivo guardado, validando el nombre
// para evitar path traversal (../../etc).
export function rutaMedia(empresaId, filename) {
  const nombreSeguro = path.basename(filename);
  return path.join(MEDIA_DIR, String(empresaId), nombreSeguro);
}
