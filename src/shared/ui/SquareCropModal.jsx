import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

const VIEW = 280; // lado del recuadro en pantalla (px)

/**
 * Recorte cuadrado (1:1) antes de subir una imagen. Se arrastra para mover y
 * se usa el control para acercar/alejar. Empieza mostrando la imagen entera
 * (un logo ancho no queda cortado); si se aleja más que el cuadrado, el
 * espacio sobrante se rellena con el color de la esquina de la imagen (o
 * transparente si la imagen lo es). El círculo marca cómo se verá el logo
 * redondo del link público.
 *
 * onConfirm(File) con la imagen cuadrada de `outputSize` px. onCancel().
 */
export default function SquareCropModal({ file, outputSize = 512, onConfirm, onCancel }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Escala que hace entrar la imagen entera en el recuadro (zoom 1) y la que lo cubre.
  const fit = img ? VIEW / Math.max(img.naturalWidth, img.naturalHeight) : 1;
  const coverZoom = img ? Math.max(img.naturalWidth, img.naturalHeight) / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const maxZoom = Math.max(coverZoom, 1) * 3;
  const scale = fit * zoom;
  const w = img ? img.naturalWidth * scale : 0;
  const h = img ? img.naturalHeight * scale : 0;

  // Que la imagen no se pueda sacar del recuadro: si es más grande, cubre todo;
  // si es más chica, queda adentro.
  const clamp = (o, z = zoom) => {
    if (!img) return o;
    const s = fit * z;
    const iw = img.naturalWidth * s;
    const ih = img.naturalHeight * s;
    const lim = (size, v) => {
      const m = Math.abs(VIEW - size) / 2;
      return Math.max(-m, Math.min(m, v));
    };
    return { x: lim(iw, o.x), y: lim(ih, o.y) };
  };

  const changeZoom = (z) => {
    const next = Math.max(1, Math.min(maxZoom, z));
    setZoom(next);
    setOffset((o) => clamp(o, next));
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY, start: offset };
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      changeZoom(pinch.current.zoom * (dist / pinch.current.dist));
      return;
    }
    if (!drag.current) return;
    const { x, y, start } = drag.current;
    setOffset(clamp({ x: start.x + e.clientX - x, y: start.y + e.clientY - y }));
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  const confirm = async () => {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    const ratio = outputSize / VIEW;

    // Relleno con el color de la esquina superior izquierda (si no es transparente).
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const pctx = probe.getContext('2d');
    pctx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
    const [r, g, b, a] = pctx.getImageData(0, 0, 1, 1).data;
    if (a > 0) {
      ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
      ctx.fillRect(0, 0, outputSize, outputSize);
    }

    const left = (VIEW - w) / 2 + offset.x;
    const top = (VIEW - h) / 2 + offset.y;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, left * ratio, top * ratio, w * ratio, h * ratio);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const name = (file.name || 'logo').replace(/\.\w+$/, '') + '.png';
    onConfirm(new File([blob], name, { type: 'image/png' }));
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title="Ajusta el logo"
      description="Arrastra para moverlo y usa el control para acercarlo."
      size="sm"
      z={70}
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button onClick={confirm} disabled={!img}>Usar recorte</Button>
        </div>
      )}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative overflow-hidden rounded-lg bg-nexus-surface touch-none select-none cursor-grab active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW, backgroundImage: 'repeating-conic-gradient(rgba(127,127,127,.15) 0% 25%, transparent 0% 50%)', backgroundSize: '16px 16px' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {img && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="absolute max-w-none pointer-events-none"
              style={{ width: w, height: h, left: (VIEW - w) / 2 + offset.x, top: (VIEW - h) / 2 + offset.y }}
            />
          )}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,.35)', border: '2px solid rgba(255,255,255,.8)' }}
            aria-hidden="true"
          />
        </div>

        <div className="flex w-full items-center gap-3" style={{ maxWidth: VIEW }}>
          <ZoomOut className="h-4 w-4 shrink-0 text-nexus-text-muted" aria-hidden="true" />
          <input
            type="range"
            min={1}
            max={maxZoom}
            step={0.01}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="w-full accent-nexus-primary"
          />
          <ZoomIn className="h-4 w-4 shrink-0 text-nexus-text-muted" aria-hidden="true" />
        </div>
      </div>
    </Modal>
  );
}
