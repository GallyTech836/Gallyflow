// DepositStep.jsx — Después de reservar en un negocio que pide anticipo.
// Estilo billetera: el QR grande, sin descargas; el cliente le toma captura y
// paga desde la app de su banco. Cuenta regresiva del tiempo para pagar.
// "Ya pagué" avisa al negocio (el backend guarda el horario un rato más para
// que confirme) y abre WhatsApp para mandar el comprobante.

import { useEffect, useMemo, useState } from 'react';
import { Clock, CheckCircle2 } from 'lucide-react';
import { buildWhatsAppUrl } from '../shared/location/whatsappLink';
import { WhatsAppIcon } from '../shared/location/WhatsAppButton';
import { useBusinessTerms } from '../shared/businessProfiles/useBusinessProfile';
import { reportDepositPaid } from '../shared/appointments/publicBookingApi';

const bs = (n) => `Bs ${Math.round((Number(n) || 0) * 100) / 100}`;
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const hora = (ms) => new Date(ms).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });

export default function DepositStep({ deposit, negocioId, citaId, onReset, selectedDate, selectedHour, selectedServices = [], total = null, branch = null, clientName = '' }) {
  const terms = useBusinessTerms();
  const [now, setNow] = useState(() => Date.now());
  const [reported, setReported] = useState(null); // { expiresAt } cuando avisó "ya pagué"
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const expMs = Date.parse(reported?.expiresAt || deposit.expiresAt);
  const restante = expMs - now;
  const vencida = Number.isFinite(expMs) && restante <= 0;
  const urgente = !reported && restante <= 60000;

  const fechaLegible = useMemo(() => {
    if (!selectedDate) return '';
    const t = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }, [selectedDate]);

  const phone = deposit.phone || branch?.phone || '';
  const mensaje = `Hola${clientName ? `, soy ${clientName}` : ''}. Pagué el anticipo de ${bs(deposit.amount)} de mi ${terms.tl('appointment')}${fechaLegible ? ` del ${fechaLegible}` : ''}${selectedHour ? ` a las ${selectedHour}` : ''}. Te envío el comprobante.`;
  const waUrl = buildWhatsAppUrl(phone, mensaje);
  const saldo = typeof total === 'number' ? Math.max(0, total - deposit.amount) : null;

  // El enlace de WhatsApp se abre igual (es un <a>); el aviso al backend va en paralelo.
  const avisarPago = () => {
    if (reported || vencida || !citaId) return;
    const fallback = { expiresAt: new Date(Date.now() + (deposit.verifyMinutes || 120) * 60000).toISOString() };
    setReported(fallback);
    reportDepositPaid(negocioId, citaId).then((r) => { if (r.ok && r.expiresAt) setReported({ expiresAt: r.expiresAt }); });
  };

  return (
    <div className="flex-1 flex flex-col items-center py-2 text-center space-y-4 animate-scale-up">
      <div className="space-y-1">
        <h2 className="text-2xl font-extrabold tracking-tight text-nexus-text">{reported ? 'Avisaste que ya pagaste' : 'Paga el anticipo para confirmar'}</h2>
        <p className="mx-auto max-w-xs text-xs leading-relaxed text-nexus-text-secondary">
          {reported
            ? `El negocio revisa el pago y confirma tu ${terms.tl('appointment')}.`
            : `Tu ${terms.tl('appointment')} ${terms.g('appointment', 'está guardado', 'está guardada')}, pero se confirma cuando el negocio reciba el anticipo.`}
        </p>
      </div>

      {/* Cuenta regresiva */}
      {!reported ? (
        <div className={`flex w-full items-center justify-center gap-2.5 rounded-2xl border px-4 py-3 ${vencida || urgente ? 'border-nexus-error/30 bg-nexus-error-bg text-nexus-error-text' : 'border-nexus-border bg-nexus-surface text-nexus-text'}`} role="timer" aria-live="off">
          <Clock size={20} className="shrink-0" aria-hidden="true" />
          {vencida ? (
            <p className="text-sm font-semibold">Se acabó el tiempo y el horario se liberó. Si ya pagaste, escríbele al negocio.</p>
          ) : (
            <p className="text-sm">Tienes <b className="nx-num text-2xl font-extrabold align-middle">{mmss(restante)}</b> para pagar</p>
          )}
        </div>
      ) : (
        <div className="flex w-full items-center gap-2.5 rounded-2xl border border-nexus-success/30 bg-nexus-success-bg px-4 py-3 text-left text-sm text-nexus-success-text">
          <CheckCircle2 size={20} className="shrink-0" aria-hidden="true" />
          <p>Tu horario queda guardado hasta las <b className="nx-num">{hora(expMs)}</b> mientras el negocio confirma.</p>
        </div>
      )}

      <div className="w-full rounded-2xl border border-nexus-border bg-nexus-surface p-3">
        <p className="text-xs font-semibold text-nexus-text-secondary">Anticipo por {deposit.method}</p>
        <p className="nx-num text-4xl font-extrabold text-nexus-text">{bs(deposit.amount)}</p>
        {deposit.qrImage && (
          <img
            src={deposit.qrImage}
            alt={`QR para pagar el anticipo de ${bs(deposit.amount)}`}
            className="mx-auto mt-2 aspect-square w-full max-w-[380px] rounded-xl bg-white object-contain"
          />
        )}
        {!reported && <p className="mt-2 text-xs text-nexus-text-secondary">Toma una captura de pantalla y paga desde la app de tu banco.</p>}
        {deposit.instructions && <p className="mt-2 whitespace-pre-line text-sm text-nexus-text">{deposit.instructions}</p>}
      </div>

      {waUrl ? (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={avisarPago}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-nexus-success/30 bg-nexus-success-bg px-4 py-4 text-sm font-bold text-nexus-success-text transition-all hover:opacity-80 active:scale-[0.97]"
        >
          <WhatsAppIcon size={17} /> {reported ? 'Enviar comprobante por WhatsApp' : 'Ya pagué: enviar comprobante'}
        </a>
      ) : !reported && !vencida ? (
        <button
          type="button"
          onClick={avisarPago}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-nexus-success/30 bg-nexus-success-bg px-4 py-4 text-sm font-bold text-nexus-success-text transition-all hover:opacity-80 active:scale-[0.97]"
        >
          Ya pagué
        </button>
      ) : null}

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
