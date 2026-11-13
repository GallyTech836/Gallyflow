import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Globe, ChevronDown, ExternalLink, Copy, Check, QrCode, Download } from 'lucide-react';
import { Modal, Button } from '../ui';
import { encodeQR } from './qrcode';

const QUIET = 4; // margen blanco (en módulos) que piden los lectores

// Dibuja el QR en un canvas: siempre negro sobre blanco, aunque la app esté en modo oscuro.
function drawQR(canvas, text, pixelSize, caption = '') {
  const { size, modules } = encodeQR(text, 'M');
  const scale = Math.max(1, Math.floor(pixelSize / (size + QUIET * 2)));
  const qrPx = (size + QUIET * 2) * scale;
  const captionPx = caption ? Math.round(qrPx * 0.12) : 0;
  canvas.width = qrPx;
  canvas.height = qrPx + captionPx;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) ctx.fillRect((x + QUIET) * scale, (y + QUIET) * scale, scale, scale);
    }
  }
  if (caption) {
    ctx.font = `600 ${Math.round(captionPx * 0.45)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(caption, qrPx / 2, qrPx + captionPx * 0.35, qrPx - scale * QUIET * 2);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Respaldo para navegadores sin permiso de portapapeles
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

function slugFile(name) {
  return (name || 'reservas')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'reservas';
}

// Celular o tablet (pantalla táctil): ahí se usa el menú de compartir del sistema.
const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
const isIOS = () => typeof navigator !== 'undefined'
  && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function QRModal({ open, onClose, url, name, title = 'QR de reservas' }) {
  const [copied, setCopied] = useState(false);
  const [image, setImage] = useState(null); // { dataUrl, file }
  const [showSaveHint, setShowSaveHint] = useState(false);

  // La imagen se prepara al abrir: iOS solo deja compartir si la acción ocurre
  // justo después del toque, sin esperar a generar el PNG.
  useEffect(() => {
    if (!open || !url) return undefined;
    let cancelled = false;
    setShowSaveHint(false);
    const canvas = document.createElement('canvas');
    drawQR(canvas, url, 1200, name || '');
    const dataUrl = canvas.toDataURL('image/png');
    setImage({ dataUrl, file: null });
    canvas.toBlob((blob) => {
      if (cancelled || !blob) return;
      const file = new File([blob], `qr-${slugFile(name)}.png`, { type: 'image/png' });
      setImage({ dataUrl, file });
    }, 'image/png');
    return () => { cancelled = true; };
  }, [open, url, name]);

  const handleCopy = async () => {
    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const downloadWithLink = () => {
    const a = document.createElement('a');
    a.href = image.dataUrl;
    a.download = `qr-${slugFile(name)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownload = () => {
    if (!image) return undefined;
    const file = image.file;
    // Celular/tablet: hoja de compartir con la imagen (Guardar imagen, WhatsApp, imprimir...).
    // share() se llama sin esperas antes, para no perder el permiso del toque en iOS.
    if (isTouchDevice() && file && navigator.canShare?.({ files: [file] })) {
      return navigator.share({ files: [file], title: name ? `QR de ${name}` : 'QR de reservas' })
        .catch((err) => {
          if (err?.name !== 'AbortError') setShowSaveHint(true);
        });
    }
    // iPhone sin compartir archivos (o app instalada): guardar con pulsación larga.
    if (isIOS()) {
      setShowSaveHint(true);
      return undefined;
    }
    downloadWithLink();
    return undefined;
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-xl border border-nexus-border bg-white p-2">
          {image ? (
            <img
              src={image.dataUrl}
              alt={name ? `QR de reservas de ${name}` : 'QR de reservas'}
              className="block w-56 h-auto"
              style={{ imageRendering: 'pixelated', WebkitTouchCallout: 'default' }}
            />
          ) : (
            <div className="w-56 h-56" />
          )}
        </div>
        {showSaveHint ? (
          <p className="w-full rounded-lg bg-nexus-surface-hover px-3 py-2 text-center text-sm text-nexus-text">
            Mantén presionado el QR y elige «Guardar en Fotos».
          </p>
        ) : (
          <p className="w-full break-all text-center text-sm text-nexus-text-secondary">{url}</p>
        )}
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" icon={copied ? Check : Copy} onClick={handleCopy} fullWidth>
            {copied ? 'Copiado' : 'Copiar enlace'}
          </Button>
          <Button icon={Download} onClick={handleDownload} disabled={!image} fullWidth>
            Descargar QR
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Botón del mundo con menú: Abrir enlace / Ver QR.
// El menú se dibuja en un portal (encima de todo) para que la agenda no lo tape.
export default function ShareLinkMenu({ url, name }) {
  const [menuPos, setMenuPos] = useState(null); // null = cerrado
  const [qrOpen, setQrOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const menuOpen = !!menuPos;

  const closeMenu = () => setMenuPos(null);
  const toggleMenu = () => {
    if (menuOpen) { closeMenu(); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      closeMenu();
    };
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [menuOpen]);

  if (!url) return null;

  const itemClass = 'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-nexus-text hover:bg-nexus-surface-hover transition-colors cursor-pointer';

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggleMenu}
        title="Enlace de reservas"
        aria-label="Opciones del enlace de reservas"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={`inline-flex h-10 items-center justify-center gap-0.5 pl-2.5 pr-1.5 bg-nexus-surface border hover:border-nexus-primary/60 hover:bg-nexus-surface-hover text-nexus-text-secondary hover:text-nexus-text rounded-lg transition-colors cursor-pointer ${menuOpen ? 'border-nexus-primary/60 text-nexus-text' : 'border-nexus-border'}`}
      >
        <Globe className="w-[18px] h-[18px]" />
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
      </button>

      {menuOpen && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 55 }}
          className="w-44 overflow-hidden rounded-lg border border-nexus-border bg-nexus-surface py-1 shadow-[var(--nx-shadow-lg)]"
        >
          <a
            role="menuitem"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeMenu}
            className={itemClass}
          >
            <ExternalLink className="w-4 h-4 text-nexus-text-secondary" />
            Abrir enlace
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => { closeMenu(); setQrOpen(true); }}
            className={itemClass}
          >
            <QrCode className="w-4 h-4 text-nexus-text-secondary" />
            Ver QR
          </button>
        </div>,
        document.body,
      )}

      <QRModal open={qrOpen} onClose={() => setQrOpen(false)} url={url} name={name} />
    </div>
  );
}
