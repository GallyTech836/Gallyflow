// saveImage.js — Guardar una imagen en el celular (también iPhone).
// Mismo criterio que el QR de reservas (ShareLinkMenu):
//   celular con "compartir archivos" -> hoja del sistema (Guardar imagen, WhatsApp...)
//   iPhone sin eso                   -> aviso: mantener presionada la imagen
//   computadora / Android            -> descarga directa
// La imagen se baja ANTES del toque: iOS solo deja compartir si share() se
// llama enseguida después de tocar.

import { useEffect, useState } from 'react';

export const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
export const isIOS = () => typeof navigator !== 'undefined'
  && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Baja la imagen y la deja lista como File + URL local. null mientras carga o si falla. */
export function useSavableImage(url, filename = 'imagen.png') {
  const [img, setImg] = useState(null); // { file, objectUrl }
  useEffect(() => {
    if (!url) return undefined;
    let cancel = false;
    let objectUrl = '';
    fetch(url, { mode: 'cors' })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        if (cancel) return;
        const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png';
        const ext = (type.split('/')[1] || 'png').split('+')[0].replace('jpeg', 'jpg');
        const name = filename.replace(/\.\w+$/, '') + '.' + ext;
        objectUrl = URL.createObjectURL(blob);
        setImg({ file: new File([blob], name, { type }), objectUrl });
      })
      .catch(() => { if (!cancel) setImg(null); });
    return () => { cancel = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, filename]);
  return img;
}

/**
 * Guarda la imagen ya preparada. Devuelve 'shared' | 'hint' | 'downloaded' | 'opened'.
 * 'hint' = mostrar "mantén presionada la imagen y elige Guardar en Fotos".
 */
export function saveImage(img, { url, title = '' } = {}) {
  const file = img?.file;
  if (isTouchDevice() && file && navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title }).catch(() => {});
    return 'shared';
  }
  if (isIOS()) return 'hint';
  if (img?.objectUrl) {
    const a = document.createElement('a');
    a.href = img.objectUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return 'downloaded';
  }
  if (url) window.open(url, '_blank', 'noopener');
  return 'opened';
}
