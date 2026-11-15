import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Modal, Button, Field, Input, Select, ChoiceChips } from '../../shared/ui';
import { branchOptions, stockOf, todayLocal, money, toInt } from './inventoryModel';
import { getCompraOpciones, createCompra, newRequestId } from '../finanzas/finanzasApi';

const emptyRow = () => ({ productId: '', qty: 1, cost: '' });

/**
 * Registrar compra: el stock sube y, si el negocio usa Finanzas, el gasto
 * (o la deuda) queda anotado en Finanzas en el mismo paso. Lo hace el
 * backend en una sola transacción.
 */
export default function PurchaseModal({ products = [], branches = [], initialBranch = null, onClose, onToast }) {
  const opts = useMemo(() => branchOptions(branches), [branches]);
  const multi = opts.length > 1;
  const requestId = useRef(newRequestId()).current;
  const [branchKey, setBranchKey] = useState(initialBranch && opts.some((b) => b.key === initialBranch) ? initialBranch : opts[0].key);
  const [supplier, setSupplier] = useState('');
  const [rows, setRows] = useState([emptyRow()]);
  const [opciones, setOpciones] = useState(null); // { finanzas, accounts }
  const [paid, setPaid] = useState('si');
  const [accountId, setAccountId] = useState('');
  const [due, setDue] = useState(todayLocal());
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    getCompraOpciones().then((r) => {
      if (!vivo) return;
      const data = r.ok ? r.data : { finanzas: false, accounts: [] };
      setOpciones(data);
      setAccountId(data.accounts.find((a) => !a.isCaja)?.id || data.accounts[0]?.id || '');
    });
    return () => { vivo = false; };
  }, []);

  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const sorted = useMemo(() => [...products].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })), [products]);
  const lineas = rows.map((r) => {
    const p = byId[r.productId];
    const qty = Math.max(0, toInt(r.qty));
    const cost = r.cost === '' ? (p?.cost ?? '') : r.cost;
    return { ...r, p, qty, cost, subtotal: p ? Math.round((Number(cost) || 0) * qty * 100) / 100 : 0 };
  });
  const total = Math.round(lineas.reduce((t, l) => t + l.subtotal, 0) * 100) / 100;
  const updateRow = (idx, patch) => { setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r))); setError(''); };
  const conFinanzas = !!opciones?.finanzas;

  const handleSave = async () => {
    setError('');
    const items = lineas.filter((l) => l.p);
    if (!items.length) return setError('Agrega al menos un producto.');
    if (items.some((l) => l.qty <= 0)) return setError('La cantidad tiene que ser mayor a 0.');
    if (items.some((l) => l.cost === '' || Number(l.cost) < 0 || Number.isNaN(Number(l.cost)))) return setError('Escribe el costo de cada producto (puede ser 0).');
    if (conFinanzas && paid === 'si' && total > 0 && !accountId) return setError('Elige de dónde salió la plata.');
    if (conFinanzas && paid === 'despues' && !due) return setError('Elige hasta cuándo tienes que pagarlo.');
    const r = await createCompra({
      requestId, branchKey, supplier: supplier.trim(),
      items: items.map((l) => ({ productId: l.p.id, qty: l.qty, cost: Number(l.cost) })),
      paidNow: paid === 'si', accountId: paid === 'si' ? accountId : null, due: paid === 'despues' ? due : null,
    });
    if (!r.ok) return setError(r.data?.error || 'No se pudo guardar la compra.');
    const d = r.data;
    const msg = !d.finanzas
      ? 'Stock actualizado.'
      : d.paidNow
        ? `Stock actualizado y gasto de ${money(d.total)} anotado en Finanzas${d.fromCaja ? ' (también salió de la caja)' : ''}.`
        : `Stock actualizado. La deuda de ${money(d.total)} quedó en «Tienes que pagar».`;
    onToast?.(msg);
    onClose();
  };

  return (
    <Modal
      onClose={onClose}
      size="lg"
      title="Registrar compra"
      description={conFinanzas ? 'El stock sube y el gasto queda en Finanzas, en un solo paso.' : 'El stock sube al guardar.'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">Cancelar</Button>
          <Button onClick={handleSave} disabled={!opciones} fullWidth className="sm:w-auto">Guardar compra · {money(total)}</Button>
        </>
      )}
    >
      <div className="space-y-5">
        <div className={`grid grid-cols-1 gap-3 ${multi ? 'sm:grid-cols-2' : ''}`}>
          <Field label="¿A quién le compraste?" hint="Opcional">
            <Input value={supplier} maxLength={80} placeholder="Ej.: Distribuidora Sur" onChange={(e) => setSupplier(e.target.value)} />
          </Field>
          {multi && (
            <Field label="¿A qué sucursal llega?" required>
              <Select value={branchKey} onChange={(e) => setBranchKey(e.target.value)}>
                {opts.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
              </Select>
            </Field>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-nexus-text-secondary">¿Qué compraste?</p>
          {lineas.map((l, idx) => (
            <div key={idx} className="grid grid-cols-12 items-end gap-2 rounded-xl border border-nexus-border bg-nexus-background p-2.5">
              <div className="col-span-12 sm:col-span-6">
                <Select aria-label="Producto" value={l.productId} onChange={(e) => updateRow(idx, { productId: e.target.value, cost: '' })}>
                  <option value="">Seleccionar producto…</option>
                  {sorted.map((p) => <option key={p.id} value={p.id}>{p.name} ({stockOf(p, branchKey, branches)} uds)</option>)}
                </Select>
              </div>
              <div className="col-span-3 sm:col-span-2">
                <span className="mb-1 block text-xs text-nexus-text-muted sm:hidden">Cant.</span>
                <Input aria-label="Cantidad" type="number" inputMode="numeric" min="1" value={rows[idx].qty} onChange={(e) => updateRow(idx, { qty: e.target.value })} className="nx-num text-center" />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <span className="mb-1 block text-xs text-nexus-text-muted sm:hidden">Costo c/u</span>
                <Input aria-label="Costo por unidad" type="number" inputMode="decimal" min="0" step="0.5" placeholder="0" value={l.cost} onChange={(e) => updateRow(idx, { cost: e.target.value })} className="nx-num text-right" />
              </div>
              <div className="col-span-4 sm:col-span-1 flex h-10 items-center justify-end whitespace-nowrap nx-num text-sm font-semibold text-nexus-text">
                {l.p ? money(l.subtotal) : '—'}
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
            </div>
          ))}
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => setRows((rs) => [...rs, emptyRow()])}>Agregar producto</Button>
          <p className="text-xs text-nexus-text-muted">El costo que pongas queda como el último costo del producto.</p>
        </div>

        {conFinanzas && (
          <div className="space-y-4">
            <Field label="¿Ya lo pagaste?">
              <ChoiceChips label="¿Ya lo pagaste?" options={[{ value: 'si', label: 'Sí, ya pagué' }, { value: 'despues', label: 'Lo pago después' }]} value={paid} onChange={setPaid} />
            </Field>
            {paid === 'si' ? (
              <Field label="¿De dónde salió la plata?">
                <ChoiceChips label="De dónde salió" options={opciones.accounts.map((a) => ({ value: a.id, label: a.name }))} value={accountId} onChange={setAccountId} />
              </Field>
            ) : (
              <Field label="¿Hasta cuándo tienes que pagarlo?">
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="sm:max-w-[220px]" />
              </Field>
            )}
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border border-nexus-border bg-nexus-background px-4 py-3">
          <span className="text-sm text-nexus-text-secondary">Total</span>
          <span className="nx-num text-xl font-bold text-nexus-text">{money(total)}</span>
        </div>

        {error && <p role="alert" className="text-sm text-nexus-error-text">{error}</p>}
      </div>
    </Modal>
  );
}
