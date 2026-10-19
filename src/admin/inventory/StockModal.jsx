import { useMemo, useState } from 'react';
import { Modal, Button, Field, Input, Select, SegmentedControl } from '../../shared/ui';
import { ADJUST_REASONS, branchOptions, stockOf, toInt } from './inventoryModel';
import { adjustStock, transferStock } from './inventoryApi';

/**
 * Ajuste de stock de un producto: Entrada, Salida, Conteo y (con 2+
 * sucursales) Traspaso entre sucursales. Todo queda en Movimientos.
 */
export default function StockModal({ negocioId, product, branches = [], initialBranch = null, initialMode = 'entrada', uid, onClose, onToast }) {
  const opts = useMemo(() => branchOptions(branches), [branches]);
  const multi = opts.length > 1;
  const [mode, setMode] = useState(initialMode === 'traspaso' && !multi ? 'entrada' : initialMode);
  const [branchKey, setBranchKey] = useState(initialBranch && opts.some((b) => b.key === initialBranch) ? initialBranch : opts[0].key);
  const [toKey, setToKey] = useState(() => opts.find((b) => b.key !== branchKey)?.key || '');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(ADJUST_REASONS[initialMode]?.[0] || '');
  const [error, setError] = useState('');

  const current = stockOf(product, branchKey, branches);
  const n = Math.max(0, toInt(qty));
  const result = mode === 'entrada' ? current + n : mode === 'conteo' ? n : current - n;

  const modeOptions = [
    { value: 'entrada', label: 'Entrada' },
    { value: 'salida', label: 'Salida' },
    { value: 'conteo', label: 'Conteo' },
    ...(multi ? [{ value: 'traspaso', label: 'Traspaso' }] : []),
  ];

  const changeMode = (m) => {
    setMode(m);
    setError('');
    setReason(ADJUST_REASONS[m]?.[0] || '');
    if (m === 'traspaso' && (!toKey || toKey === branchKey)) setToKey(opts.find((b) => b.key !== branchKey)?.key || '');
  };

  const handleSave = async () => {
    setError('');
    if (qty === '' || (mode !== 'conteo' && n <= 0)) { setError('Ingresa una cantidad.'); return; }
    try {
      if (mode === 'traspaso') {
        await transferStock(negocioId, { productId: product.id, fromKey: branchKey, toKey, qty: n, branches, uid });
        onToast?.('Traspaso registrado.');
      } else {
        if (result < 0) { setError(`Solo hay ${current} unidades.`); return; }
        await adjustStock(negocioId, { productId: product.id, branchKey, mode, qty: n, reason, branches, uid });
        onToast?.('Stock actualizado.');
      }
      onClose();
    } catch (err) {
      console.error('[inventario] ajuste:', err);
      setError(err.message || 'No se pudo actualizar el stock.');
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="md"
      title="Ajustar stock"
      description={product.name}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">Cancelar</Button>
          <Button onClick={handleSave} fullWidth className="sm:w-auto">Guardar</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <SegmentedControl options={modeOptions} value={mode} onChange={changeMode} className="w-full" ariaLabel="Tipo de ajuste" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {multi && (
            <Field label={mode === 'traspaso' ? 'Desde' : 'Sucursal'}>
              <Select value={branchKey} onChange={(e) => { setBranchKey(e.target.value); setError(''); }}>
                {opts.map((b) => <option key={b.key} value={b.key}>{b.name} ({stockOf(product, b.key, branches)})</option>)}
              </Select>
            </Field>
          )}
          {mode === 'traspaso' && (
            <Field label="Hacia">
              <Select value={toKey} onChange={(e) => setToKey(e.target.value)}>
                {opts.filter((b) => b.key !== branchKey).map((b) => <option key={b.key} value={b.key}>{b.name} ({stockOf(product, b.key, branches)})</option>)}
              </Select>
            </Field>
          )}
          <Field label={mode === 'conteo' ? 'Cantidad contada' : 'Cantidad'} required>
            <Input type="number" inputMode="numeric" min="0" value={qty} onChange={(e) => { setQty(e.target.value); setError(''); }} placeholder="0" className="nx-num" autoFocus />
          </Field>
          {mode !== 'traspaso' && ADJUST_REASONS[mode]?.length > 1 && (
            <Field label="Motivo">
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                {ADJUST_REASONS[mode].map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-nexus-border bg-nexus-background px-4 py-3 text-sm">
          <span className="text-nexus-text-secondary">
            {mode === 'traspaso' ? 'Quedarán en origen' : 'Stock actual → nuevo'}
          </span>
          <span className="nx-num font-semibold text-nexus-text">
            {mode === 'traspaso'
              ? `${current - n} uds`
              : <>{current} → <span className={result < 0 ? 'text-nexus-error-text' : 'text-nexus-primary'}>{result}</span> uds</>}
          </span>
        </div>

        {error && <p role="alert" className="text-sm text-nexus-error-text">{error}</p>}
      </div>
    </Modal>
  );
}
