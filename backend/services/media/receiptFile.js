// receiptFile.js — Comprobante del anticipo que el cliente manda por WhatsApp
// (foto o PDF). Mismo camino que intakePhoto.js: YCloud entrega un link que
// se descarga con la API key y se sube a Cloudinary (preset sin firma).
// Meta Cloud API directa solo manda un id de media: no se guarda el archivo,
// pero el aviso al dueño igual sale.

import { logger } from '../../utils/logger.js';
import { puedeDescargar } from './intakePhoto.js';

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'yr91yhlf';
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || 'Gallyflow';
const MAX_BYTES = 10 * 1024 * 1024;
const TIPOS = /^(image\/(jpeg|png|webp)|application\/pdf)$/;

export const esComprobante = (media) => /^(image\/|application\/pdf)/i.test(String(media?.mimeType || 'image/'));

/** -> { url, type } o null si no se pudo guardar (nunca lanza). */
export async function guardarComprobante(media, { fetchImpl = fetch } = {}) {
  if (!puedeDescargar(media)) return null;
  try {
    const apiKey = process.env.YCLOUD_API_KEY;
    const res = await fetchImpl(media.link, { headers: apiKey ? { 'X-API-Key': apiKey } : {} });
    if (!res.ok) throw new Error(`descarga ${res.status}`);
    const tipo = String(res.headers.get('content-type') || media.mimeType || '').split(';')[0].trim();
    if (!TIPOS.test(tipo)) throw new Error(`tipo ${tipo || '?'}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) throw new Error('tamaño');
    const form = new FormData();
    form.append('file', new Blob([buf], { type: tipo }), tipo === 'application/pdf' ? 'comprobante.pdf' : 'comprobante.jpg');
    form.append('upload_preset', UPLOAD_PRESET);
    const up = await fetchImpl(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, { method: 'POST', body: form });
    const data = await up.json().catch(() => ({}));
    if (!up.ok || !data.secure_url) throw new Error(`cloudinary ${up.status}`);
    return { url: data.secure_url, type: tipo === 'application/pdf' ? 'pdf' : 'image' };
  } catch (err) {
    logger.warn('[receiptFile] no se pudo guardar el comprobante:', err.message);
    return null;
  }
}
