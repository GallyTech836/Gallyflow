import { useMemo, useState } from 'react';
import { Modal, Button, Field, Input, Select, Textarea, ImageUploader } from '../../shared/ui';
import { PRODUCT_TYPES, branchOptions, toInt } from './inventoryModel';
import { saveProduct } from './inventoryApi';

const EMPTY = { name: '', category: '', sku: '', type: 'venta', description: '', price: '', cost: '', minStock: 5, image: '' };

/** Alta / edición de producto. El stock solo se carga en el alta; después se usa "Ajustar stock". */
export default function ProductModal({ negocioId, product = null, categories = [], branches = [], uid, onClose, onToast }) {
  const isEdit = !!product;
  const [form, setForm] = useState(() => (product ? {
    ...EMPTY,
    ...product,
    price: product.price ?? '',
    cost: product.cost ?? '',
    minStock: product.minStock ?? 0,
  } : EMPTY));
  const opts = useMemo(() => branchOptions(branches), [branches]);
  const [initialStock, setInitialStock] = useState(() => Object.fromEntries(opts.map((b) => [b.key, ''])));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => { setError(''); setForm((f) => ({ ...f, [k]: v })); };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Escribe el nombre del producto.'); return; }
    if (form.type !== 'insumo' && !(Number(form.price) > 0)) { setError('Ingresa el precio de venta.'); return; }
    try {
      await saveProduct(negocioId, product?.id || null, form, { initialStock, branches, uid });
      onToast?.(isEdit ? 'Producto actualizado.' : 'Producto registrado.');
      onClose();
    } catch (err) {
      console.error('[inventario] guardar producto:', err);
      setError(err.message || 'No se pudo guardar el producto.');
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Editar producto' : 'Nuevo producto'}
      description={isEdit ? 'El stock se cambia con "Ajustar stock" para que quede registrado.' : 'Datos del producto y stock inicial.'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">Cancelar</Button>
          <Button onClick={handleSave} disabled={uploading} fullWidth className="sm:w-auto">{isEdit ? 'Guardar cambios' : 'Guardar producto'}</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <ImageUploader
          label="Foto del producto"
          value={form.image}
          onChange={(url) => set('image', url)}
          onUploadingChange={setUploading}
          maxSize={800}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre" required>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Cera mate fuerte" maxLength={120} />
          </Field>
          <Field label="Categoría" hint="Elige una o escribe una nueva.">
            <Input list="nx-product-categories" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Ej. Fijación" maxLength={60} />
            <datalist id="nx-product-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label="Tipo">
            <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
              {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="SKU / código" hint="Opcional">
            <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="Ej. FIJ-001" maxLength={40} className="nx-num" />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Precio venta (Bs)" required={form.type !== 'insumo'}>
            <Input type="number" inputMode="decimal" min="0" step="0.5" value={form.price} onChange={(e) => set('price', e.target.value)} className="nx-num" />
          </Field>
          <Field label="Costo (Bs)" hint="Opcional">
            <Input type="number" inputMode="decimal" min="0" step="0.5" value={form.cost} onChange={(e) => set('cost', e.target.value)} className="nx-num" />
          </Field>
          <Field label="Stock mínimo" hint="Aviso de bajo stock">
            <Input type="number" inputMode="numeric" min="0" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} className="nx-num" />
          </Field>
        </div>

        {!isEdit && (
          <div className="rounded-xl border border-nexus-border bg-nexus-background p-3">
            <p className="mb-2 text-xs font-medium text-nexus-text-secondary">
              Stock inicial{opts.length > 1 ? ' por sucursal' : ''}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {opts.map((b) => (
                <Field key={b.key} label={opts.length > 1 ? b.name : 'Unidades'}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={initialStock[b.key]}
                    onChange={(e) => setInitialStock((s) => ({ ...s, [b.key]: e.target.value === '' ? '' : Math.max(0, toInt(e.target.value)) }))}
                    placeholder="0"
                    className="nx-num"
                  />
                </Field>
              ))}
            </div>
          </div>
        )}

        <Field label="Descripción" hint="Opcional">
          <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={500} />
        </Field>

        {error && <p role="alert" className="text-sm text-nexus-error-text">{error}</p>}
      </div>
    </Modal>
  );
}
