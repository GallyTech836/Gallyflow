import { Link2, Copy, Share2 } from 'lucide-react';

export default function PersonalBookingLink({ url, onToast = () => {} }) {
  if (!url) return null;

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      onToast('Link copiado', 'success');
    } catch {
      onToast('No se pudo copiar. Mantén presionado el link para copiarlo.', 'error');
    }
  };

  const share = async () => {
    const text = 'Reserva tu cita conmigo aquí:';
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Mi link de reserva', text, url });
      } catch {
        /* el usuario canceló */
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="text-left bg-nexus-background border border-nexus-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-nexus-primary" />
        <h4 className="text-xs font-extrabold text-nexus-text">Mi link de reserva</h4>
      </div>
      <p className="text-sm text-nexus-text-secondary leading-snug">
        Tus clientes reservan directo contigo, sin elegir sucursal ni profesional.
      </p>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.target.select()}
        className="w-full bg-nexus-surface border border-nexus-border rounded-lg h-10 px-3 text-sm text-nexus-text-secondary nx-num outline-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={copy}
          className="h-11 bg-nexus-primary-soft border border-nexus-primary/30 text-nexus-primary font-semibold text-sm rounded-xl flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97] transition-all"
        >
          <Copy className="w-3.5 h-3.5" /> Copiar
        </button>
        <button
          type="button"
          onClick={share}
          className="h-11 bg-nexus-primary text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97] transition-all"
        >
          <Share2 className="w-3.5 h-3.5" /> Compartir
        </button>
      </div>
    </div>
  );
}