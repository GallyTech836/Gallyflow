import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Modal, Button, Field, Input, Select, Textarea } from '../../shared/ui';
import { useBusinessTerms } from '../../shared/businessProfiles/useBusinessProfile';
import { branchOptions, stockOf, isSellable, buildSaleItems, todayLocal, money, toInt } from './inventoryModel';
import { createSale } from './inventoryApi';

const emptyRow = () => ({ productId: '', qty: 1, price: '' });

/** Registrar una venta de productos. Descuenta el stock de la sucursal elegida. */
export default function SaleModal({ negocioId, products = [], branches = [], clients = [], paymentMethods = [], initialBranch = null, uid, onClose, onToast }) {
  const { t } = useBusinessTerms();
  const opts = useMemo(() => branchOptions(branches), [branches]);
  const multi = opts.length > 1;
  const [branchKey, setBranchKey] = useState(initialBranch && opts.some((b) => b.key === initialBranch) ? initialBranch : opts[0].key);
  const [date, setDate] = useState(todayLocal());
  const [clientId, setClientId] = useState('');
  const [rows, setRows] = useState([emptyRow()]);
  const methods = paymentMethods.length ? paymentMethods : ['Efectivo'];
  const [paymentMethod, setPaymentMethod] = useState(methods[0]);
  const [status, setStatus] = useState('paid');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const sellable = useMemo(() => products.filter(isSellable), [products]);
  const sortedClients = useMemo(
    () => [...clients].filter((c) => c?.id).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })),
    [clients],
  );

  const effectiveRows = rows.map((r) => ({ ...r, price: r.price === '' ? byId[r.productId]?.price : r.price }));
  const { items, total } = buildSaleItems(effectiveRows, byId);

  // Unidades pedidas por producto (sumando filas repetidas) vs stock de la sucursal.
  const shortages = items
    .map((i) => ({ ...i, have: stockOf(byId[i.productId], branchKey, branches) }))
    .filter((i) => i.qty > i.have);

  const updateRow = (idx, patch) => {
    setError('');
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    setError('');
    if (!items.length) { setError('Agrega al menos un producto.'); return; }
    if (shortages.length) { setError(`Stock insuficiente de "${shortages[0].name}" (quedan ${shortages[0].have}).`); return; }
    const client = sortedClients.find((c) => c.id === clientId);
    try {
      await createSale(negocioId, {
        date, branchKey, clientId: client?.id || null, clientName: client?.name || '',
        items, paymentMethod, status, notes,
      }, { branches, uid });
      onToast?.('Venta registrada.');
      onClose();
    } catch (err) {
      console.error('[inventario] venta:', err);
      setError(err.message || 'No se pudo registrar la venta.');
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="lg"
      title="Nueva venta"
      description="Se descuenta del stock al guardar."
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">Cancelar</Button>
          <Button onClick={handleSave} fullWidth className="sm:w-auto">Registrar venta · {money(total)}</Button>
        </>
      )}
    >
      <div className="space-y-5">
        <div className={`grid grid-cols-1 gap-3 ${multi ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          <Field label="Fecha" required>
            <Input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value || todayLocal())} className="nx-num" />
          </Field>
          {multi && (
            <Field label="Sucursal" required>
              <Select value={branchKey} onChange={(e) => { setBranchKey(e.target.value); setError(''); }}>
                {opts.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label={`${t('client')} (opcional)`}>
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">{t('client')} general</option>
              {sortedClients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </Select>
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-nexus-text-secondary">Productos</p>
          {sellable.length === 0 && (
            <p className="rounded-lg border border-dashed border-nexus-border p-3 text-sm text-nexus-text-muted">
              No hay productos para venta. Regístralos en la pestaña Stock.
            </p>
          )}
          {rows.map((row, idx) => {
            const p = byId[row.productId];
            const have = p ? stockOf(p, branchKey, branches) : null;
            const qty = Math.max(0, toInt(row.qty));
            const price = row.price === '' ? (p?.price ?? '') : row.price;
            return (
              <div key={idx} className="grid grid-cols-12 items-end gap-2 rounded-xl border border-nexus-border bg-nexus-background p-2.5">
                <div className="col-span-12 sm:col-span-6">
                  <Select
                    aria-label="Producto"
                    value={row.productId}
                    onChange={(e) => updateRow(idx, { productId: e.target.value, price: '' })}
                  >
                    <option value="">Seleccionar producto…</option>
                    {sellable.map((s) => {
                      const st = stockOf(s, branchKey, branches);
                      return <option key={s.id} value={s.id} disabled={st <= 0}>{s.name} ({st <= 0 ? 'agotado' : `${st} uds`})</option>;
                    })}
                  </Select>
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <span className="mb-1 block text-xs text-nexus-text-muted sm:hidden">Cant.</span>
                  <Input aria-label="Cantidad" type="number" inputMode="numeric" min="1" value={row.qty} onChange={(e) => updateRow(idx, { qty: e.target.value })} className="nx-num text-center" />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <span className="mb-1 block text-xs text-nexus-text-muted sm:hidden">Precio</span>
                  <Input aria-label="Precio unitario" type="number" inputMode="decimal" min="0" step="0.5" value={price} onChange={(e) => updateRow(idx, { price: e.target.value })} className="nx-num text-right" />
                </div>
                <div className="col-span-4 sm:col-span-1 flex h-10 items-center justify-end nx-num text-sm font-semibold text-nexus-text">
                  {p ? money((Number(price) || 0) * qty) : '—'}
                </div>
                <div className="col-span-1 flex h-10 items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setRows((rs) => (rs.length === 1 ? [emptyRow()] : rs.filter((_, i) => i !== idx)))}
                    aria-label="Quitar producto"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-nexus-text-muted hover:bg-nexus-error-bg hover:text-nexus-error-text cursor-pointer"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                {p && qty > have && (
                  <p className="col-span-12 text-xs text-nexus-error-text">Solo quedan {have} en esta sucursal.</p>
                )}
              </div>
            );
          })}
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => setRows((rs) => [...rs, emptyRow()])}>Agregar producto</Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-nexus-text-secondary">Método de pago</p>
            <div className="flex flex-wrap gap-2">
              {methods.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  aria-pressed={paymentMethod === m}
                  className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors cursor-pointer ${paymentMethod === m ? 'border-nexus-primary bg-nexus-primary-soft text-nexus-primary' : 'border-nexus-border bg-nexus-surface text-nexus-text-secondary hover:border-nexus-primary/50'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-nexus-text-secondary">Estado</p>
            <div className="flex gap-2">
              {[{ v: 'paid', l: 'Pagada' }, { v: 'pending', l: 'Por cobrar' }].map(({ v, l }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStatus(v)}
                  aria-pressed={status === v}
                  className={`h-9 flex-1 rounded-lg border px-3 text-sm font-medium transition-colors cursor-pointer ${status === v
                    ? (v === 'paid' ? 'border-nexus-success/40 bg-nexus-success-bg text-nexus-success-text' : 'border-nexus-warning/40 bg-nexus-warning-bg text-nexus-warning-text')
                    : 'border-nexus-border bg-nexus-surface text-nexus-text-secondary hover:border-nexus-primary/50'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Field label="Notas" hint="Opcional">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </Field>

        <div className="flex items-center justify-between rounded-xl border border-nexus-border bg-nexus-background px-4 py-3">
          <span className="text-sm text-nexus-text-secondary">Total</span>
          <span className="nx-num text-xl font-bold text-nexus-text">{money(total)}</span>
        </div>

        {error && <p role="alert" className="text-sm text-nexus-error-text">{error}</p>}
      </div>
    </Modal>
  );
}
