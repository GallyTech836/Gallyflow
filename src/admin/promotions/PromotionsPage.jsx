// PromotionsPage.jsx — Gestión → Promociones: descuentos y combos con
// vigencia, días y sucursales. Esta etapa solo los configura; el precio de las
// citas todavía no cambia.

import { useMemo, useState } from 'react';
import { Tag, Plus, Pencil, Trash2, Pause, Play } from 'lucide-react';
import { Button, IconButton, Badge, EmptyState, LoadingState, useConfirm } from '../../shared/ui';
import {
  PROMO_TYPES, PROMO_STATUS, PROMO_STATUS_LABELS, sortPromotions, promotionStatus, todayLaPaz,
  describePromotion, describeDates, describeWeekdays, describeBranches,
} from '../../shared/promotions/promotionModel';
import { usePromotions, setPromotionActive, deletePromotion } from '../../shared/promotions/usePromotions';
import PromotionModal from './PromotionModal';

const STATUS_TONE = {
  [PROMO_STATUS.ACTIVE]: 'success',
  [PROMO_STATUS.SCHEDULED]: 'info',
  [PROMO_STATUS.PAUSED]: 'neutral',
  [PROMO_STATUS.EXPIRED]: 'neutral',
};

export default function PromotionsPage({ negocioId, services = [], branches = [], onToast }) {
  const { promotions, loading, error } = usePromotions(negocioId);
  const [confirm, confirmDialog] = useConfirm();
  const [editing, setEditing] = useState(null); // null | 'new' | promo
  const today = todayLaPaz();
  const list = useMemo(() => sortPromotions(promotions, today), [promotions, today]);

  async function togglePause(p) {
    try {
      await setPromotionActive(negocioId, p.id, p.active === false);
      onToast?.(p.active === false ? 'Promoción reanudada.' : 'Promoción pausada.');
    } catch (err) {
      console.error('[promociones] pausar:', err);
      onToast?.('No se pudo cambiar la promoción.', 'error');
    }
  }

  async function remove(p) {
    const ok = await confirm({
      title: '¿Eliminar esta promoción?',
      subject: p.name,
      message: 'Las citas que ya la usaron conservan su precio.',
    });
    if (!ok) return;
    try {
      await deletePromotion(negocioId, p.id);
      onToast?.('Promoción eliminada.');
    } catch (err) {
      console.error('[promociones] eliminar:', err);
      onToast?.('No se pudo eliminar.', 'error');
    }
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      {list.length > 0 && (
        <div className="flex justify-end">
          <Button icon={Plus} onClick={() => setEditing('new')}>Nueva promoción</Button>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-nexus-error-bg px-3 py-2 text-sm text-nexus-error-text">{error}</p>}

      {loading ? <LoadingState /> : list.length === 0 ? (
        <div className="rounded-xl border border-nexus-border bg-nexus-surface">
          <EmptyState
            icon={Tag}
            title="Sin promociones"
            description="Crea un descuento o un combo con fechas y días."
            action={<Button icon={Plus} onClick={() => setEditing('new')}>Nueva promoción</Button>}
          />
        </div>
      ) : (
        <ul className="divide-y divide-nexus-border overflow-hidden rounded-xl border border-nexus-border bg-nexus-surface">
          {list.map((p) => {
            const status = promotionStatus(p, today);
            const expired = status === PROMO_STATUS.EXPIRED;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                <div className={`min-w-0 flex-1 ${expired ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-nexus-text">{p.name}</span>
                    <Badge tone={STATUS_TONE[status]}>{PROMO_STATUS_LABELS[status]}</Badge>
                    {p.type === PROMO_TYPES.COMBO && <Badge>Combo</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-nexus-text-secondary">{describePromotion(p, services)}</p>
                  <p className="mt-0.5 text-xs text-nexus-text-muted">
                    {describeDates(p)} · {describeWeekdays(p.weekdays)}
                    {branches.length > 1 ? ` · ${describeBranches(p.branchIds, branches)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!expired && (
                    <IconButton
                      icon={p.active === false ? Play : Pause}
                      label={p.active === false ? 'Reanudar' : 'Pausar'}
                      onClick={() => togglePause(p)}
                    />
                  )}
                  <IconButton icon={Pencil} label="Editar" onClick={() => setEditing(p)} />
                  <IconButton icon={Trash2} label="Eliminar" onClick={() => remove(p)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <PromotionModal
          negocioId={negocioId}
          promotion={editing === 'new' ? null : editing}
          services={services}
          branches={branches}
          onClose={() => setEditing(null)}
          onToast={onToast}
        />
      )}
    </div>
  );
}
