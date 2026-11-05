import React, { useState } from 'react';
import ImageUploader from '../shared/ui/ImageUploader';
import { activeFields, validateIntake, AGE_UNITS } from '../shared/bookingForms/bookingFormModel';
import { todayLaPaz } from '../shared/promotions/promotionModel';

const inputClass = 'w-full bg-nexus-background border border-nexus-border p-3.5 rounded-xl outline-none focus:border-nexus-primary transition-all text-sm font-bold text-nexus-text placeholder-nexus-text-muted';

const PLACEHOLDERS = { petName: 'Ej: Toby', breed: 'Ej: Caniche' };

/**
 * Paso del link público con el formulario del tipo de negocio (peluquería
 * canina: datos de la mascota). Campos, etiquetas, orden y obligatorios
 * salen de la config del negocio (bookingFormModel). El backend vuelve a
 * validar al reservar.
 */
export default function BookingFormStep({ form, values, setValues, onNext }) {
  const [uploading, setUploading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const campos = activeFields(form);
  const hoy = todayLaPaz();
  const check = validateIntake(form, values, { hoyIso: hoy });
  const conError = new Set([...check.missing, ...check.invalid]);

  const set = (key, v) => setValues((prev) => ({ ...prev, [key]: v }));

  const continuar = () => {
    if (!check.ok) { setShowErrors(true); return; }
    onNext();
  };

  return (
    <div className="flex-1 flex flex-col justify-between animate-fade-in py-2">
      <div className="space-y-4">
        {campos.map((f) => {
          const err = showErrors && conError.has(f.label);
          const label = (
            <label className="text-xs text-nexus-primary font-bold block">
              {f.label}{f.required ? ' *' : <span className="font-medium text-nexus-text-muted"> (opcional)</span>}
            </label>
          );
          let control = null;
          if (f.type === 'image') {
            return (
              <div key={f.key} className="space-y-1.5">
                {label}
                <ImageUploader
                  label=""
                  value={values[f.key] || ''}
                  onChange={(url) => set(f.key, url)}
                  onUploadingChange={setUploading}
                  maxSize={1000}
                  hint="Una foto ayuda a identificar a tu mascota."
                />
                {err && <p role="alert" className="text-xs text-nexus-error-text">Agrega una foto.</p>}
              </div>
            );
          }
          if (f.type === 'select') {
            control = (
              <div className="flex flex-wrap gap-2">
                {(f.options || []).map((o) => {
                  const on = values[f.key] === o;
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => set(f.key, on ? '' : o)}
                      aria-pressed={on}
                      className={`px-4 py-2.5 rounded-xl border text-sm font-bold transition-all cursor-pointer ${on ? 'bg-nexus-primary border-nexus-primary text-white' : 'bg-nexus-background border-nexus-border text-nexus-text hover:border-nexus-primary/50'}`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            );
          } else if (f.type === 'age') {
            const age = values[f.key] && typeof values[f.key] === 'object' ? values[f.key] : { value: '', unit: 'años' };
            const setAge = (patch) => {
              const next = { ...age, ...patch };
              set(f.key, next.value === '' ? '' : next);
            };
            control = (
              <div className="flex gap-2">
                <input
                  type="number" inputMode="decimal" min="0" step="1"
                  value={age.value}
                  onChange={(e) => setAge({ value: e.target.value === '' ? '' : Number(e.target.value) })}
                  placeholder="Ej: 3"
                  className={`${inputClass} flex-1 nx-num`}
                />
                <div className="flex rounded-xl border border-nexus-border overflow-hidden shrink-0">
                  {AGE_UNITS.map((u) => (
                    <button
                      key={u} type="button" onClick={() => setAge({ unit: u })} aria-pressed={age.unit === u}
                      className={`px-3.5 text-sm font-bold transition-colors cursor-pointer ${age.unit === u ? 'bg-nexus-primary text-white' : 'bg-nexus-background text-nexus-text-secondary'}`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            );
          } else if (f.type === 'date') {
            control = (
              <input type="date" max={hoy} value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} className={inputClass} />
            );
          } else {
            control = (
              <input type="text" maxLength={60} value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} placeholder={PLACEHOLDERS[f.key] || ''} className={inputClass} />
            );
          }
          return (
            <div key={f.key} className="space-y-1.5">
              {label}
              {control}
              {err && <p role="alert" className="text-xs text-nexus-error-text">{check.invalid.includes(f.label) ? 'Revisa este dato.' : 'Este dato es obligatorio.'}</p>}
            </div>
          );
        })}
      </div>

      <div className="pt-6 mt-6 border-t border-nexus-border">
        <button
          type="button"
          disabled={uploading}
          onClick={continuar}
          className="w-full py-5 px-8 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-bold text-sm sm:text-base rounded-2xl disabled:opacity-30 disabled:pointer-events-none transition-all duration-300 flex items-center justify-center gap-3 shadow-md hover:shadow-lg active:scale-[0.97]"
        >
          {uploading ? 'Subiendo foto…' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}
