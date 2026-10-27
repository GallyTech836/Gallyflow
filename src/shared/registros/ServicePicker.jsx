import { Check } from 'lucide-react';
import { formatAmount } from '../servicePricing/servicePricing';
import { Input } from '../ui';
import { servicesOf, lineFor } from './servicePickerModel';

/**
 * Selección rápida de servicios para el registro: un toque elige el servicio.
 * El precio sale del mismo cálculo que las citas (precio del profesional >
 * precio base). Solo los de precio variable piden el precio final.
 *
 * selected: { [serviceId]: string }  — el valor es el precio final escrito
 *           (solo se usa en los variables; '' en los fijos).
 */
export default function ServicePicker({ services = [], professional = null, selected = {}, onChange, errors = {}, emptyText }) {
  const list = servicesOf(services, professional);
  if (!professional) return null;
  if (list.length === 0) {
    return <p className="rounded-lg border border-dashed border-nexus-border px-3 py-4 text-center text-sm text-nexus-text-secondary">{emptyText || 'No tiene servicios asignados.'}</p>;
  }

  const toggle = (id) => {
    const next = { ...selected };
    if (id in next) delete next[id];
    else next[id] = '';
    onChange?.(next);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((svc) => {
          const line = lineFor(svc, professional);
          const active = svc.id in selected;
          return (
            <button
              key={svc.id}
              type="button"
              onClick={() => toggle(svc.id)}
              aria-pressed={active}
              className={`relative flex min-h-16 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${active
                ? 'border-nexus-primary bg-nexus-primary-soft text-nexus-primary'
                : 'border-nexus-border bg-nexus-surface text-nexus-text hover:bg-nexus-surface-hover'}`}
            >
              {active && <Check className="absolute right-2 top-2 h-4 w-4" aria-hidden="true" />}
              <span className="pr-5 text-sm font-semibold leading-tight">{svc.name}</span>
              <span className="nx-num mt-0.5 text-xs text-nexus-text-secondary">{formatAmount(line.price, line.priceVariable)}</span>
            </button>
          );
        })}
      </div>

      {list.filter((svc) => svc.id in selected && lineFor(svc, professional).priceVariable).map((svc) => {
        const line = lineFor(svc, professional);
        return (
          <div key={svc.id} className="rounded-lg border border-nexus-border bg-nexus-background p-2.5">
            <label htmlFor={`precio-${svc.id}`} className="text-xs font-medium text-nexus-text-secondary">
              Precio final de {svc.name} <span className="text-nexus-text-muted">(mín. Bs {line.listPrice})</span>
            </label>
            <Input
              id={`precio-${svc.id}`}
              type="number"
              inputMode="decimal"
              min={line.listPrice}
              step="0.5"
              value={selected[svc.id]}
              onChange={(e) => onChange?.({ ...selected, [svc.id]: e.target.value })}
              placeholder={`Desde ${line.listPrice}`}
              error={errors[svc.id]}
              className="mt-1"
            />
            {errors[svc.id] && <p role="alert" className="mt-1 text-xs text-nexus-error-text">{errors[svc.id]}</p>}
          </div>
        );
      })}
    </div>
  );
}
