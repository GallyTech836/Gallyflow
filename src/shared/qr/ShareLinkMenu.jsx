import { useEffect, useRef, useState } from 'react';
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

export function QRModal({ open, onClose, url, name, title = 'QR de reservas' }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && url && canvasRef.current) drawQR(canvasRef.current, url, 560);
  }, [open, url]);

  const handleCopy = async () => {
    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleDownload = () => {
    const canvas = document.createElement('canvas');
    drawQR(canvas, url, 1200, name || '');
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `qr-${slugFile(name)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-xl border border-nexus-border bg-white p-2">
          <canvas ref={canvasRef} className="block w-56 h-56" style={{ imageRendering: 'pixelated' }} />
        </div>
        <p className="w-full break-all text-center text-sm text-nexus-text-secondary">{url}</p>
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" icon={copied ? Check : Copy} onClick={handleCopy} fullWidth>
            {copied ? 'Copiado' : 'Copiar enlace'}
          </Button>
          <Button icon={Download} onClick={handleDownload} fullWidth>
            Descargar QR
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Botón del mundo con menú: Abrir enlace / Copiar enlace / Ver QR.
export default function ShareLinkMenu({ url, name }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!url) return null;

  const itemClass = 'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-nexus-text hover:bg-nexus-surface-hover transition-colors cursor-pointer';

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        title="Enlace de reservas"
        aria-label="Opciones del enlace de reservas"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={`inline-flex h-10 items-center justify-center gap-0.5 pl-2.5 pr-1.5 bg-nexus-surface border hover:border-nexus-primary/60 hover:bg-nexus-surface-hover text-nexus-text-secondary hover:text-nexus-text rounded-lg transition-colors cursor-pointer ${menuOpen ? 'border-nexus-primary/60 text-nexus-text' : 'border-nexus-border'}`}
      >
        <Globe className="w-[18px] h-[18px]" />
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-lg border border-nexus-border bg-nexus-surface py-1 shadow-[var(--nx-shadow-lg)]"
        >
          <a
            role="menuitem"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className={itemClass}
          >
            <ExternalLink className="w-4 h-4 text-nexus-text-secondary" />
            Abrir enlace
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              if (await copyText(url)) {
                setCopied(true);
                setTimeout(() => { setCopied(false); setMenuOpen(false); }, 900);
              }
            }}
            className={itemClass}
          >
            {copied
              ? <Check className="w-4 h-4 text-nexus-text-secondary" />
              : <Copy className="w-4 h-4 text-nexus-text-secondary" />}
            {copied ? 'Copiado' : 'Copiar enlace'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setMenuOpen(false); setQrOpen(true); }}
            className={itemClass}
          >
            <QrCode className="w-4 h-4 text-nexus-text-secondary" />
            Ver QR
          </button>
        </div>
      )}

      <QRModal open={qrOpen} onClose={() => setQrOpen(false)} url={url} name={name} />
    </div>
  );
}
