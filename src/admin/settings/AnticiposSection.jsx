// AnticiposSection.jsx — Configuración › Anticipos (capacidad 'anticipos').
// Se guarda en negocios/{id}.businessSettings.anticipos (las reglas permiten
// que el admin cambie businessSettings). La reserva pública la lee el backend.

import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { QrCode } from 'lucide-react';
import { db } from '../../firebase/config';
import { Card, Button, Field, Input, ChoiceChips } from '../../shared/ui';
import QrUploader from '../../shared/anticipos/QrUploader';
import { normalizeAnticipoConfig, anticipoReady, MIN_MINUTES, MAX_MINUTES } from '../../shared/anticipos/anticipoModel';
import { DEFAULT_PAYMENT_METHODS } from '../../shared/businessSettings/businessSettingsModel';

export default function AnticiposSection({ negocioId, services = [] }) {
  const [form, setForm] = useState(null);
  const [methods, setMethods] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { tone, text }

  useEffect(() => {
    let vivo = true;
    getDoc(doc(db, 'negocios', negocioId)).then((snap) => {
      if (!vivo) return;
      const bs = snap.data()?.businessSettings || {};
      const pm = Array.isArray(bs.paymentMethods) && bs.paymentMethods.length ? bs.paymentMethods : DEFAULT_PAYMENT_METHODS;
      setMethods(pm);
      setForm(normalizeAnticipoConfig(bs.anticipos, pm));
    });
    return () => { vivo = false; };
  }, [negocioId]);

  const noCash = useMemo(() => methods.filter((m) => m && !/^efectivo$/i.test(m) && m !== 'Pendiente'), [methods]);
  const sorted = useMemo(() => [...services].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')), [services]);

  if (!form) return <Card><div className="h-24 animate-pulse rounded-lg bg-nexus-surface-hover" /></Card>;

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setMsg(null); };
  const toggleExcluded = (id) => set({ excludedServiceIds: form.excludedServiceIds.includes(id) ? form.excludedServiceIds.filter((x) => x !== id) : [...form.excludedServiceIds, id] });

  const ejemplo = form.mode === 'percent' ? `De un servicio de Bs 100, el cliente paga Bs ${Math.ceil(form.value)} antes.` : `El cliente paga Bs ${form.value} antes (o el precio, si es menor).`;

  const save = async () => {
    const clean = normalizeAnticipoConfig(form, methods);
    if (clean.enabled && !clean.method) return setMsg({ tone: 'error', text: 'Agrega un método de pago que no sea efectivo (por ejemplo QR) en Configuración › Negocio.' });
    if (clean.enabled && !clean.qrImage) return setMsg({ tone: 'error', text: 'Sube la imagen de tu QR para cobrar el anticipo.' });
    setSaving(true);
    try {
      await setDoc(doc(db, 'negocios', negocioId), { businessSettings: { anticipos: clean } }, { merge: true });
      setForm(clean);
      setMsg({ tone: 'ok', text: clean.enabled ? 'Guardado. Las reservas del link público ahora piden anticipo.' : 'Guardado. Los anticipos están apagados.' });
    } catch (err) {
      setMsg({ tone: 'error', text: `No se pudo guardar: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-1 flex items-center gap-2.5">
          <QrCode className="h-5 w-5 text-nexus-primary" aria-hidden="true" />
          <h3 className="text-base font-semibold text-nexus-text">Anticipos por QR</h3>
        </div>
        <p className="mb-4 text-sm text-nexus-text-secondary">
          Quien reserva por el link paga una parte con tu QR. La reserva queda por confirmar y guarda el horario hasta que tú confirmes el pago desde la reserva. Si no se paga a tiempo, el horario se libera solo.
        </p>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-nexus-border p-3">
          <span>
            <span className="block text-sm font-semibold text-nexus-text">Pedir anticipo al reservar</span>
            <span className="block text-xs text-nexus-text-secondary">Solo en el link público. Las reservas por WhatsApp siguen igual.</span>
          </span>
          <input type="checkbox" className="h-5 w-5 accent-[var(--nx-primary)]" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        </label>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="¿Cuánto pide?">
            <ChoiceChips label="Tipo de anticipo" options={[{ value: 'percent', label: 'Porcentaje' }, { value: 'fixed', label: 'Monto fijo' }]} value={form.mode} onChange={(mode) => set({ mode, value: mode === 'percent' ? 50 : 20 })} />
          </Field>
          <Field label={form.mode === 'percent' ? 'Porcentaje del precio (%)' : 'Monto (Bs)'} hint={ejemplo}>
            <Input type="number" inputMode="decimal" min="1" max={form.mode === 'percent' ? 100 : undefined} className="nx-num" value={form.value} onChange={(e) => set({ value: e.target.value })} />
          </Field>
          <Field label="Tiempo para pagar (minutos)" hint={`Entre ${MIN_MINUTES} y ${MAX_MINUTES / 60} horas. Después se libera el horario.`}>
            <Input type="number" inputMode="numeric" min={MIN_MINUTES} max={MAX_MINUTES} className="nx-num" value={form.minutes} onChange={(e) => set({ minutes: e.target.value })} />
          </Field>
          <Field label="¿Cómo entra el anticipo?" hint={noCash.length ? 'En Finanzas entra a la cuenta de este método.' : 'Agrega QR u otro método en Configuración › Negocio.'}>
            <ChoiceChips label="Método del anticipo" options={noCash} value={form.method} onChange={(method) => set({ method })} />
          </Field>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold text-nexus-text">Lo que ve el cliente</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[260px_1fr]">
          <QrUploader hint="Puede ser una captura de tu banco: la recortas al subirla." value={form.qrImage} onChange={(url) => set({ qrImage: url })} onUploadingChange={setUploading} />
          <div className="space-y-4">
            <Field label="Instrucciones (opcional)" hint="Ej.: pon tu nombre en la glosa.">
              <textarea
                rows={3}
                maxLength={300}
                value={form.instructions}
                onChange={(e) => set({ instructions: e.target.value })}
                className="w-full resize-none rounded-lg border border-nexus-border bg-nexus-background px-3 py-2 text-base text-nexus-text outline-none focus:border-nexus-primary sm:text-sm"
              />
            </Field>
            <Field label="WhatsApp para el comprobante (opcional)" hint="Si lo dejas vacío, se usa el de la sucursal.">
              <Input type="tel" inputMode="tel" placeholder="+591 70000000" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
          </div>
        </div>
      </Card>

      {sorted.length > 0 && (
        <Card>
          <h3 className="text-base font-semibold text-nexus-text">Servicios que no piden anticipo</h3>
          <p className="mb-3 text-sm text-nexus-text-secondary">Márcalos si no quieres cobrar anticipo por ellos. Si la reserva solo tiene servicios marcados, se confirma sin anticipo.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Servicios sin anticipo">
            {sorted.map((s) => {
              const on = form.excludedServiceIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleExcluded(s.id)}
                  className={`inline-flex h-10 cursor-pointer items-center rounded-full border px-3.5 text-sm font-semibold transition-colors ${on ? 'border-nexus-primary bg-nexus-primary text-white' : 'border-nexus-border bg-nexus-surface text-nexus-text hover:bg-nexus-surface-hover'}`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        {msg && <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`text-sm ${msg.tone === 'error' ? 'text-nexus-error-text' : 'text-nexus-success-text'}`}>{msg.text}</p>}
        {form.enabled && !anticipoReady(normalizeAnticipoConfig(form, methods)) && !msg && <p className="text-sm text-nexus-text-secondary">Falta el QR o el método para empezar a pedir anticipos.</p>}
        <Button onClick={save} loading={saving} disabled={uploading}>Guardar</Button>
      </div>
    </div>
  );
}
