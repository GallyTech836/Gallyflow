// QrUploader.jsx — Subir el QR de cobro recortado.
// Al elegir la imagen (por ejemplo una captura de la app del banco) se abre
// un recorte cuadrado. Si el navegador sabe detectar códigos QR
// (BarcodeDetector: Chrome/Android), el recuadro ya aparece sobre el QR; si no,
// se mueve y se achica con el dedo o el mouse. Se sube solo el recorte.

import { useEffect, useRef, useState } from 'react';
import { Modal, Button } from '../ui';
import { uploadImage } from '../cloudinary/uploadImage';

const OUT_MAX = 1000;   // px del recorte subido
const MIN_FRAC = 0.12;  // recuadro mínimo: 12 % del lado menor

async function detectQrBox(img) {
  try {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
    const formats = await window.BarcodeDetector.getSupportedFormats?.();
    if (formats && !formats.includes('qr_code')) return null;
    const found = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(img);
    return found?.[0]?.boundingBox || null;
  } catch {
    return null;
  }
}

/** Recuadro cuadrado inicial: sobre el QR detectado (con margen) o centrado. */
function initialCrop(w, h, box) {
  const lado = Math.min(w, h);
  if (box) {
    const size = Math.min(lado, Math.max(box.width, box.height) * 1.16);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    return clamp({ x: cx - size / 2, y: cy - size / 2, size }, w, h);
  }
  const size = lado * 0.8;
  return { x: (w - size) / 2, y: (h - size) / 2, size };
}

function clamp(c, w, h) {
  const size = Math.max(Math.min(w, h) * MIN_FRAC, Math.min(c.size, w, h));
  return { size, x: Math.min(Math.max(0, c.x), w - size), y: Math.min(Math.max(0, c.y), h - size) };
}

function CropModal({ file, onCancel, onDone }) {
  const [src] = useState(() => URL.createObjectURL(file));
  const imgRef = useRef(null);
  const [nat, setNat] = useState(null);       // { w, h } tamaño real
  const [disp, setDisp] = useState(1);        // escala pantalla / real
  const [crop, setCrop] = useState(null);     // en px reales
  const [detected, setDetected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef(null);

  useEffect(() => () => URL.revokeObjectURL(src), [src]);

  const onLoad = async () => {
    const img = imgRef.current;
    const w = img.naturalWidth; const h = img.naturalHeight;
    setNat({ w, h });
    setDisp(img.clientWidth / w);
    const box = await detectQrBox(img);
    setDetected(!!box);
    setCrop(initialCrop(w, h, box));
  };

  useEffect(() => {
    const onResize = () => { if (imgRef.current && nat) setDisp(imgRef.current.clientWidth / nat.w); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [nat]);

  const start = (mode) => (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode, x0: e.clientX, y0: e.clientY, c0: crop };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d || !nat) return;
    const dx = (e.clientX - d.x0) / disp;
    const dy = (e.clientY - d.y0) / disp;
    if (d.mode === 'move') setCrop(clamp({ ...d.c0, x: d.c0.x + dx, y: d.c0.y + dy }, nat.w, nat.h));
    else setCrop(clamp({ ...d.c0, size: d.c0.size + Math.max(dx, dy) }, nat.w, nat.h));
  };
  const end = () => { drag.current = null; };

  const nudge = (e) => {
    if (!crop || !nat) return;
    const step = Math.max(2, nat.w / 100);
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!k) return;
    e.preventDefault();
    setCrop(clamp({ ...crop, x: crop.x + k[0], y: crop.y + k[1] }, nat.w, nat.h));
  };

  const upload = async (whole) => {
    setBusy(true); setError('');
    try {
      let out = file;
      if (!whole) {
        const size = Math.min(OUT_MAX, Math.round(crop.size));
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = size < crop.size;
        ctx.drawImage(imgRef.current, crop.x, crop.y, crop.size, crop.size, 0, 0, size, size);
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        out = new File([blob], 'qr.png', { type: 'image/png' });
      }
      const url = await uploadImage(out, { maxSize: OUT_MAX });
      onDone(url);
    } catch (err) {
      setError(`No se pudo subir: ${err.message}`);
      setBusy(false);
    }
  };

  const box = crop ? { left: crop.x * disp, top: crop.y * disp, width: crop.size * disp, height: crop.size * disp } : null;

  return (
    <Modal
      title="Recorta tu QR"
      description={detected ? 'Encontramos el QR y lo marcamos. Ajusta si hace falta.' : 'Mueve el recuadro sobre el QR. Arrastra la esquina para cambiar el tamaño.'}
      onClose={busy ? undefined : onCancel}
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button variant="secondary" onClick={() => upload(true)} disabled={busy || !crop}>Usar la imagen entera</Button>
          <Button onClick={() => upload(false)} loading={busy} disabled={!crop}>Usar recorte</Button>
        </div>
      )}
    >
      <div className="flex justify-center">
        <div className="relative inline-block max-w-full touch-none select-none" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <img ref={imgRef} src={src} alt="Imagen del QR a recortar" onLoad={onLoad} className="block max-h-[60vh] max-w-full" draggable={false} />
          {box && (
            <>
              {/* oscurece lo que queda afuera del recorte */}
              <div className="pointer-events-none absolute inset-0" style={{ boxShadow: 'none' }} aria-hidden="true">
                <div className="absolute border-2 border-white" style={{ ...box, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }} />
              </div>
              <div
                role="slider"
                tabIndex={0}
                aria-label="Recorte del QR (usa las flechas para moverlo)"
                aria-valuenow={Math.round(crop.size)}
                onKeyDown={nudge}
                onPointerDown={start('move')}
                className="absolute cursor-move outline-none focus-visible:ring-2 focus-visible:ring-nexus-primary"
                style={box}
              >
                <span
                  onPointerDown={(e) => { e.stopPropagation(); start('resize')(e); }}
                  className="absolute -bottom-3 -right-3 h-7 w-7 cursor-nwse-resize rounded-full border-2 border-white bg-nexus-primary"
                  aria-hidden="true"
                />
              </div>
            </>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-nexus-error-text">{error}</p>}
    </Modal>
  );
}

export default function QrUploader({ value = '', onChange, onUploadingChange, label = 'Tu QR de cobro', hint = '' }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    setFile(f);
    onUploadingChange?.(true);
  };
  const close = () => { setFile(null); onUploadingChange?.(false); };

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-nexus-text-secondary">{label}</p>
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-nexus-border p-3">
        {value
          ? <img src={value} alt="QR de cobro" className="h-24 w-24 shrink-0 rounded-md border border-nexus-border bg-white object-contain" />
          : <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-nexus-border text-xs text-nexus-text-muted">Sin QR</div>}
        <div className="flex flex-col items-start gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>{value ? 'Cambiar QR' : 'Subir QR'}</Button>
          {value && <button type="button" onClick={() => onChange('')} className="text-xs font-semibold text-nexus-error-text cursor-pointer">Quitar</button>}
          {hint && <p className="text-xs text-nexus-text-secondary">{hint}</p>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} />
      {file && <CropModal file={file} onCancel={close} onDone={(url) => { onChange(url); close(); }} />}
    </div>
  );
}
