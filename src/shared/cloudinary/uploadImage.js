// uploadImage.js
// Helper reutilizable para subir imágenes a Cloudinary usando un upload
// preset sin firmar (unsigned). Nunca se guarda Base64 ni se usa Firebase
// Storage: este helper siempre devuelve la URL pública (secure_url) que
// hay que persistir en Firestore.

const CLOUDINARY_CLOUD_NAME = 'yr91yhlf';
const CLOUDINARY_UPLOAD_PRESET = 'Gallyflow';

/**
 * Sube un archivo de imagen a Cloudinary y devuelve su URL pública.
 * @param {File} file - archivo seleccionado por el usuario (input type="file" o drag&drop).
 * @returns {Promise<string>} secure_url devuelta por Cloudinary.
 */
export async function uploadImage(file) {
  if (!file) {
    throw new Error('No se proporcionó ningún archivo para subir.');
  }

  const formData = new FormData();
  formData.append('file', file);
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