// intakePhoto.js
//
// Foto que el cliente manda por WhatsApp durante el formulario de reserva
// (peluquería canina). YCloud entrega en el webhook un `image.link` que se
// descarga con la API key; aquí se baja, se valida y se sube a Cloudinary con
// el mismo preset sin firma que usa el front (src/shared/cloudinary/uploadImage.js),
// así la cita guarda una URL de Cloudinary igual que en el link público.
//
// Meta Cloud API (número directo, sin YCloud) solo manda un id de media que
// hay que pedir a la Graph API: no está soportado; el bot ofrece omitir la foto.

import { logger } from '../../utils/logger.js';

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'yr91yhlf';
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || 'Gallyflow';
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 20000;

export class PhotoError extends Error {}

function conTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

/** ¿Se puede descargar esta imagen? (solo links https de YCloud). */
export function puedeDescargar(media) {
  return typeof media?.link === 'string' && /^https:\/\/api\.ycloud\.com\//.test(media.link);
}

/**
 * Descarga la imagen de YCloud y la sube a Cloudinary.
 * -> secure_url (https://res.cloudinary.com/...). Lanza PhotoError.
 */
export async function guardarFotoDeWhatsApp(media, { fetchImpl = fetch } = {}) {
  if (!puedeDescargar(media)) throw new PhotoError('Imagen no descargable');
  const apiKey = process.env.YCLOUD_API_KEY;

  const t1 = conTimeout(TIMEOUT_MS);
  let blob;
  try {
    const res = await fetchImpl(media.link, { headers: apiKey ? { 'X-API-Key': apiKey } : {}, signal: t1.signal });
    if (!res.ok) throw new PhotoError(`Descarga ${res.status}`);
    const tipo = String(res.headers.get('content-type') || media.mimeType || '').split(';')[0].trim();
    if (!/^image\/(jpeg|png|webp)$/.test(tipo)) throw new PhotoError(`Tipo no admitido: ${tipo || '?'}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) throw new PhotoError('Tamaño no admitido');
    blob = new Blob([buf], { type: tipo });
  } finally {
    t1.done();
  }

  const form = new FormData();
  form.append('file', blob, 'mascota.jpg');
  form.append('upload_preset', UPLOAD_PRESET);

  const t2 = conTimeout(TIMEOUT_MS);
  try {
    const res = await fetchImpl(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: form, signal: t2.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.secure_url !== 'string') {
      logger.warn('[intakePhoto] Cloudinary rechazó la imagen:', data?.error?.message || res.status);
      throw new PhotoError('Subida fallida');
    }
    return data.secure_url;
  } finally {
    t2.done();
  }
}
