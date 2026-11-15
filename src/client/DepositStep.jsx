// DepositStep.jsx — Después de reservar en un negocio que pide anticipo:
// QR, monto, hasta cuándo pagar y botón para mandar el comprobante por
// WhatsApp. La reserva queda "por confirmar" hasta que el dueño confirma el pago.
// No vuelve sola al inicio (el cliente necesita tiempo para pagar).

import { useEffect, useMemo, useState } from 'react';
import { Clock, Download } from 'lucide-react';
import { buildWhatsAppUrl } from '../shared/location/whatsappLink';
import { WhatsAppIcon } from '../shared/location/WhatsAppButton';
import { useBusinessTerms } from '../shared/businessProfiles/useBusinessProfile';
import { useSavableImage, saveImage } from '../shared/qr/saveImage';

const bs = (n) => `Bs ${Math.round((Number(n) || 0) * 100) / 100}`;

export default function DepositStep({ deposit, onReset, selectedDate, selectedHour, selectedServices = [], total = null, branch = null, clientName = '' }) {
  const terms = useBusinessTerms();
  const qr = useSavableImage(deposit.qrImage, 'qr-anticipo.png');
  const [saveHint, setSaveHint] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  const expMs = Date.parse(deposit.expiresAt);
  const minutos = Math.max(0, Math.ceil((expMs - now) / 60000));
  const vencida = Number.isFinite(expMs) && expMs <= now;
  const horaLimite = Number.isFinite(expMs) ? new Date(expMs).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '';

  const fechaLegible = useMemo(() => {
    if (!selectedDate) return '';
    const t = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }, [selectedDate]);

  const phone = deposit.phone || branch?.phone || '';
  const mensaje = `Hola${clientName ? `, soy ${clientName}` : ''}. Pagué el anticipo de ${bs(deposit.amount)} de mi ${terms.tl('appointment')}${fechaLegible ? ` del ${fechaLegible}` : ''}${selectedHour ? ` a las ${selectedHour}` : ''}. Te envío el comprobante.`;
  const waUrl = buildWhatsAppUrl(phone, mensaje);
  const saldo = typeof total === 'number' ? Math.max(0, total - deposit.amount) : null;

  return (
    <div className="flex-1 flex flex-col items-center py-4 text-center space-y-5 animate-scale-up">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-extrabold tracking-tight text-nexus-text">Paga el anticipo para confirmar</h2>
        <p className="mx-auto max-w-xs text-xs leading-relaxed text-nexus-text-secondary">
          Tu {terms.tl('appointment')} {terms.g('appointment', 'está guardado', 'está guardada')}, pero se confirma cuando el negocio reciba el anticipo.
        </p>
      </div>

      <div className="w-full rounded-2xl border border-nexus-border bg-nexus-surface p-4">
        <p className="text-xs font-semibold text-nexus-text-secondary">Anticipo por {deposit.method}</p>
        <p className="nx-num text-4xl font-extrabold text-nexus-text">{bs(deposit.amount)}</p>
        {deposit.qrImage && (
          <>
            <img
              src={qr?.objectUrl || deposit.qrImage}
              alt={`QR para pagar el anticipo de ${bs(deposit.amount)}`}
              className="mx-auto mt-3 aspect-square w-full max-w-[260px] rounded-xl border border-nexus-border bg-white object-contain p-2"
              style={{ WebkitTouchCallout: 'default' }}
            />
            <button
              type="button"
              onClick={() => setSaveHint(saveImage(qr, { url: deposit.qrImage, title: 'QR del anticipo' }) === 'hint')}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-nexus-border bg-nexus-background px-4 py-3 text-sm font-semibold text-nexus-text transition-all hover:opacity-80 active:scale-[0.97]"
            >
              <Download size={16} aria-hidden="true" /> Guardar QR en el celular
            </button>
            {saveHint && (
              <p className="mt-2 rounded-lg bg-nexus-surface-hover px-3 py-2 text-sm text-nexus-text">
                Mantén presionado el QR y elige «Guardar en Fotos». Después ábrelo desde la app de tu banco.
              </p>
            )}
          </>
        )}
        {deposit.instructions && <p className="mt-3 whitespace-pre-line text-sm text-nexus-text">{deposit.instructions}</p>}
      </div>

      <div className={`flex w-full items-start gap-2.5 rounded-2xl border p-3 text-left text-sm ${vencida ? 'border-nexus-error/30 bg-nexus-error-bg text-nexus-error-text' : 'border-nexus-border bg-nexus-background text-nexus-text'}`}>
        <Clock size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          {vencida
            ? 'Se acabó el tiempo para pagar y el horario se liberó. Si ya pagaste, escríbele al negocio.'
            : <>Tienes hasta las <b className="nx-num">{horaLimite}</b> ({minutos} min). Si no se paga, el horario se libera.</>}
        </p>
      </div>

      {waUrl ? (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-nexus-success/30 bg-nexus-success-bg px-4 py-4 text-sm font-bold text-nexus-success-text transition-all hover:opacity-80 active:scale-[0.97]"
        >
          <WhatsAppIcon size={17} /> Ya pagué: enviar comprobante
        </a>
      ) : (
        <p className="text-xs text-nexus-text-secondary">Después de pagar, envía el comprobante al negocio.</p>
      )}

      <div className="w-full space-y-2.5 rounded-2xl border border-nexus-border bg-nexus-surface p-4 text-left text-xs text-nexus-text-secondary">
        {selectedServices.length > 0 && (
          <div className="flex justify-between gap-3 border-b border-nexus-border pb-2">
            <span className="shrink-0 font-semibold">{terms.t('services')}:</span>
            <span className="text-right font-bold text-nexus-text">{selectedServices.map((s) => s.name).join(', ')}</span>
          </div>
        )}
        {(fechaLegible || selectedHour) && (
          <div className="flex justify-between gap-3 border-b border-nexus-border pb-2">
            <span className="shrink-0 font-semibold">Fecha y hora:</span>
            <span className="text-right font-bold text-nexus-primary">{fechaLegible}{selectedHour ? ` · ${selectedHour} Hrs` : ''}</span>
          </div>
        )}
        {saldo !== null && (
          <div className="flex justify-between gap-3">
            <span className="font-semibold">Pagas en el local:</span>
            <span className="nx-num font-bold text-nexus-text">{bs(saldo)}</span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onReset}
        className="w-full rounded-2xl border border-nexus-primary/30 bg-nexus-primary-soft px-8 py-5 text-xs font-bold text-nexus-primary transition-all hover:opacity-80 active:scale-[0.97] sm:text-sm"
      >
        Volver al inicio
      </button>
    </div>
  );
}
