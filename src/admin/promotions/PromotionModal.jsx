// PromotionModal.jsx — Crear o editar una promoción (descuento o combo).

import { useMemo, useState } from 'react';
import { Button, Modal, Field, Input, SegmentedControl } from '../../shared/ui';
import { useBusinessTerms } from '../../shared/businessProfiles/useBusinessProfile';
import {
  PROMO_TYPES, DISCOUNT_KINDS, COMMISSION_BASES, WEEKDAYS,
  emptyPromotion, promotionToForm, validatePromotion, comboNormalPrice,
} from '../../shared/promotions/promotionModel';
import { createPromotion, updatePromotion } from '../../shared/promotions/usePromotions';

/** Botón tipo chip, igual que el filtro de profesionales de la agenda. */
function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-9 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors cursor-pointer ${
        on
          ? 'border-nexus-primary bg-nexus-primary text-white shadow-sm'
          : 'border-nexus-border bg-nexus-surface text-nexus-text-secondary hover:border-nexus-primary/40 hover:text-nexus-text'
      }`}
    >
      {children}
    </button>
  );
}

const toggleIn = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

export default function PromotionModal({ negocioId, promotion = null, services = [], branches = [], onClose, onToast }) {
  const { t, tl, g } = useBusinessTerms();
  const isEdit = !!promotion?.id;
  const [form, setForm] = useState(() => (promotion ? promotionToForm(promotion) : emptyPromotion()));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const set = (k, v) => { setErrors((e) => ({ ...e, [k]: undefined })); setSaveError(''); setForm((f) => ({ ...f, [k]: v })); };
  const isCombo = form.type === PROMO_TYPES.COMBO;
  const normalCombo = useMemo(() => comboNormalPrice(form.serviceIds, services), [form.serviceIds, services]);
  const multiBranch = branches.length > 1;

  async function save() {
    const v = validatePromotion(form, { services });
    if (!v.ok) { setErrors(v.errors); return; }
    setSaving(true);
    try {
      if (isEdit) await updatePromotion(negocioId, promotion.id, v.data);
      else await createPromotion(negocioId, v.data);
      onToast?.(isEdit ? 'Promoción actualizada.' : 'Promoción creada.');
      onClose();
    } catch (err) {
      console.error('[promociones] guardar:', err);
      setSaveError(err?.code === 'permission-denied'
        ? 'No tienes permiso para guardar promociones. Revisa las reglas de Firestore.'
        : 'No se pudo guardar. Inténtalo de nuevo.');
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Editar promoción' : 'Nueva promoción'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">Cancelar</Button>
          <Button onClick={save} loading={saving} fullWidth className="sm:w-auto">{isEdit ? 'Guardar cambios' : 'Crear promoción'}</Button>
        </>
      )}
    >
      <div className="space-y-5">
        <SegmentedControl
          ariaLabel="Tipo de promoción"
          className="w-full"
          value={form.type}
          onChange={(v) => set('type', v)}
          options={[
            { value: PROMO_TYPES.DESCUENTO, label: 'Descuento' },
            { value: PROMO_TYPES.COMBO, label: 'Combo' },
          ]}
        />

        <Field label="Nombre" required error={errors.name}>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80}
            placeholder={isCombo ? 'Ej. Corte + barba' : 'Ej. Promo de noviembre'} />
        </Field>

        <Field
          label={isCombo ? `${t('services')} del combo` : `${t('services')} con descuento`}
          error={errors.serviceIds}
        >
          {services.length === 0 ? (
            <p className="text-sm text-nexus-text-secondary">Primero crea {tl('services')}.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <Chip key={s.id} on={form.serviceIds.includes(String(s.id))} onClick={() => set('serviceIds', toggleIn(form.serviceIds, String(s.id)))}>
                  {s.name}
                </Chip>
              ))}
            </div>
          )}
        </Field>

        {isCombo ? (
          <Field
            label="Precio del combo (Bs)"
            required
            error={errors.comboPrice}
            hint={normalCombo > 0 ? `Precio normal: Bs ${normalCombo}` : undefined}
          >
            <Input type="number" inputMode="decimal" min="0" step="0.5" value={form.comboPrice}
              onChange={(e) => set('comboPrice', e.target.value)} className="nx-num sm:max-w-40" />
          </Field>
        ) : (
          <Field label="Descuento" required error={errors.discountValue}
            hint={`Se aplica sobre el precio de cada ${tl('professional')}, o el base si no tiene uno propio.`}>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                ariaLabel="Tipo de descuento"
                value={form.discountKind}
                onChange={(v) => set('discountKind', v)}
                options={[
                  { value: DISCOUNT_KINDS.PERCENT, label: '%' },
                  { value: DISCOUNT_KINDS.AMOUNT, label: 'Bs menos' },
                ]}
              />
              <Input type="number" inputMode="decimal" min="0" step={form.discountKind === DISCOUNT_KINDS.PERCENT ? '1' : '0.5'}
                value={form.discountValue} onChange={(e) => set('discountValue', e.target.value)}
                placeholder={form.discountKind === DISCOUNT_KINDS.PERCENT ? '20' : '10'} className="nx-num w-28" />
            </div>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Desde" required error={errors.startDate}>
            <Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Hasta" hint="Vacío: sin fecha de fin." error={errors.endDate}>
            <Input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set('endDate', e.target.value)} />
          </Field>
        </div>

        <Field label="Días" hint={form.weekdays.length === 0 ? 'Ninguno marcado: todos los días.' : undefined}>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <Chip key={d.value} on={form.weekdays.includes(d.value)} onClick={() => set('weekdays', toggleIn(form.weekdays, d.value))}>
                <span aria-label={d.label}>{d.short}</span>
              </Chip>
            ))}
          </div>
        </Field>

        {multiBranch && (
          <Field label="Sucursales">
            <div className="flex flex-wrap gap-2">
              <Chip on={form.branchIds.length === 0} onClick={() => set('branchIds', [])}>Todas</Chip>
              {branches.map((b) => (
                <Chip key={b.id} on={form.branchIds.includes(String(b.id))} onClick={() => set('branchIds', toggleIn(form.branchIds, String(b.id)))}>
                  {b.name}
                </Chip>
              ))}
            </div>
          </Field>
        )}

        <Field label={`Comisión ${g('professional', 'del', 'de la')} ${tl('professional')}`}>
          <SegmentedControl
            ariaLabel="Base de la comisión"
            className="w-full sm:w-auto"
            value={form.commissionBase}
            onChange={(v) => set('commissionBase', v)}
            options={[
              { value: COMMISSION_BASES.FINAL, label: 'Sobre el precio con promo' },
              { value: COMMISSION_BASES.NORMAL, label: 'Sobre el precio normal' },
            ]}
          />
        </Field>

        {saveError && <p role="alert" className="rounded-lg bg-nexus-error-bg px-3 py-2 text-sm text-nexus-error-text">{saveError}</p>}
      </div>
    </Modal>
  );
}
