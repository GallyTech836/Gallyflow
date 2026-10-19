// uploadImage.js
// Helper reutilizable para subir imágenes a Cloudinary usando un upload
// preset sin firmar (unsigned). Nunca se guarda Base64 ni se usa Firebase
// Storage: este helper siempre devuelve la URL pública (secure_url) que
// hay que persistir en Firestore.

const CLOUDINARY_CLOUD_NAME = 'yr91yhlf';
const CLOUDINARY_UPLOAD_PRESET = 'Gallyflow';

/**
 * Reduce una imagen en el navegador antes de subirla (lado mayor = maxSize,
 * JPEG/WEBP con calidad 0.85). Ahorra cuota de Cloudinary y datos del
 * cliente. Si algo falla (formato raro, navegador viejo) devuelve el
 * archivo original sin tocar.
 */
export async function resizeImageFile(file, maxSize = 1200) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 400 * 1024) { bitmap.close?.(); return file; }
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const type = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, type === 'image/webp' ? '.webp' : '.jpg'), { type });
  } catch {
    return file;
  }
}

/**
 * Sube un archivo de imagen a Cloudinary y devuelve su URL pública.
 * @param {File} file - archivo seleccionado por el usuario (input type="file" o drag&drop).
 * @param {{ maxSize?: number }} [options] - si se pasa maxSize, se reduce antes de subir.
 * @returns {Promise<string>} secure_url devuelta por Cloudinary.
 */
export async function uploadImage(file, options = {}) {
  if (!file) {
    throw new Error('No se proporcionó ningún archivo para subir.');
  }

  const toUpload = options.maxSize ? await resizeImageFile(file, options.maxSize) : file;

  const formData = new FormData();
  formData.append('file', toUpload);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );

  if (!response.ok) {
    throw new Error('No se pudo subir la imagen a Cloudinary.');
  }

  const data = await response.json();
  return data.secure_url;
}

/**
 * Versión liviana de una imagen de Cloudinary para miniaturas
 * (f_auto,q_auto + ancho). Otras URLs se devuelven tal cual.
 */
export function cloudinaryThumb(url, width = 400) {
  if (typeof url !== 'string' || !url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url || '';
  if (/\/image\/upload\/[^/]*(w_|f_auto)/.test(url)) return url;
  return url.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_limit,w_${Math.round(width)}/`);
}
