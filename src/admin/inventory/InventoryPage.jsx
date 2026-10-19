import { useMemo, useState } from 'react';
import {
  Package, Boxes, AlertCircle, XCircle, Plus, Search, Pencil, Trash2, SlidersHorizontal,
  ArrowLeftRight, TrendingUp, CheckCircle2, Ban, History, DollarSign, Clock,
} from 'lucide-react';
import {
  Button, IconButton, Input, Select, Badge, EmptyState, ResponsiveTable, LoadingState, useConfirm,
} from '../../shared/ui';
import { useBusinessTerms } from '../../shared/businessProfiles/useBusinessProfile';
import { useBusinessSettings } from '../../shared/businessSettings/useBusinessSettings';
import { cloudinaryThumb } from '../../shared/cloudinary/uploadImage';
import {
  branchOptions, stockOf, stockStatus, STOCK_STATUS, SALE_STATUS, MOVEMENT_LABELS, PRODUCT_TYPES,
  currentMonth, salesSummary, money,
} from './inventoryModel';
import { deleteProduct, markSalePaid, voidSale } from './inventoryApi';
import { useProducts, useSales, useMovements } from './useInventory';
import ProductModal from './ProductModal';
import StockModal from './StockModal';
import SaleModal from './SaleModal';

const TABS = [
  { id: 'stock', label: 'Stock' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'movimientos', label: 'Movimientos' },
];

const fmtDate = (ymd) => {
  const [y, m, d] = String(ymd || '').split('-');
  return d ? `${d}/${m}/${y.slice(2)}` : '—';
};
const fmtTs = (ts) => {
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return '—';
  return d.toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

function Kpi({ icon: Icon, label, value, tone = 'primary', active = false, onClick }) {
  const tones = {
    primary: 'bg-nexus-primary-soft text-nexus-primary',
    success: 'bg-nexus-success-bg text-nexus-success-text',
    warning: 'bg-nexus-warning-bg text-nexus-warning-text',
    danger: 'bg-nexus-error-bg text-nexus-error-text',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`flex items-center justify-between gap-3 rounded-xl border bg-nexus-surface p-4 text-left shadow-[var(--nx-shadow-sm)] transition-colors ${active ? 'border-nexus-primary ring-2 ring-nexus-primary/15' : 'border-nexus-border'} ${onClick ? 'cursor-pointer hover:border-nexus-primary/50' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-nexus-text-secondary">{label}</p>
        <p className="nx-num mt-1 truncate text-xl font-bold text-nexus-text">{value}</p>
      </div>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon size={18} aria-hidden="true" />
      </span>
    </Tag>
  );
}

export default function InventoryPage({ negocioId, branches = [], clients = [], user, onToast }) {
  const { t } = useBusinessTerms();
  const { businessSettings } = useBusinessSettings(negocioId);
  const [confirm, confirmDialog] = useConfirm();
  const [tab, setTab] = useState('stock');
  const opts = useMemo(() => branchOptions(branches), [branches]);
  const multi = opts.length > 1;
  const [branchKey, setBranchKey] = useState('all');
  const scope = multi ? (opts.some((b) => b.key === branchKey) ? branchKey : 'all') : opts[0].key;

  // ── Datos ──
  const { products, loading: loadingProducts } = useProducts(negocioId);
  const [month, setMonth] = useState(currentMonth());
  const { sales, loading: loadingSales } = useSales(negocioId, month, tab === 'ventas');
  const { movements, loading: loadingMov } = useMovements(negocioId, tab === 'movimientos');

  // ── Filtros de stock ──
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [products],
  );

  const kpis = useMemo(() => {
    let units = 0; let low = 0; let out = 0; let value = 0;
    for (const p of products) {
      const s = stockOf(p, scope, branches);
      units += s;
      value += s * (Number(p.price) || 0);
      const st = stockStatus(p, scope, branches);
      if (st === 'low') low += 1;
      if (st === 'out') out += 1;
    }
    return { count: products.length, units, low, out, value };
  }, [products, scope, branches]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (statusFilter !== 'all' && stockStatus(p, scope, branches) !== statusFilter) return false;
      if (!q) return true;
      return (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
    });
  }, [products, search, category, statusFilter, scope, branches]);

  const visibleSales = useMemo(
    () => (scope === 'all' ? sales : sales.filter((s) => s.branchKey === scope)),
    [sales, scope],
  );
  const summary = useMemo(() => salesSummary(visibleSales), [visibleSales]);
  const visibleMovements = useMemo(
    () => (scope === 'all' ? movements : movements.filter((m) => m.branchKey === scope || m.toBranchKey === scope)),
    [movements, scope],
  );

  // ── Modales ──
  const [productModal, setProductModal] = useState(null); // { product|null }
  const [stockModal, setStockModal] = useState(null); // { product, mode }
  const [saleOpen, setSaleOpen] = useState(false);
  const uid = user?.uid || null;

  const handleDelete = async (p) => {
    const total = stockOf(p, 'all', branches);
    const ok = await confirm({
      title: '¿Eliminar este producto?',
      subject: p.name,
      message: total > 0 ? `Todavía tiene ${total} unidades en stock. Las ventas registradas no se borran.` : 'Las ventas registradas no se borran.',
    });
    if (!ok) return;
    try {
      await deleteProduct(negocioId, p.id);
      onToast?.('Producto eliminado.');
    } catch (err) {
      onToast?.(`No se pudo eliminar: ${err.message}`, 'error');
    }
  };

  const handleVoid = async (s) => {
    const ok = await confirm({
      title: '¿Anular esta venta?',
      subject: `${s.clientName} · ${money(s.total)}`,
      message: 'Las unidades vuelven al stock de la sucursal.',
      confirmLabel: 'Anular venta',
      irreversible: true,
    });
    if (!ok) return;
    try {
      await voidSale(negocioId, s.id, { branches, uid });
      onToast?.('Venta anulada. El stock se devolvió.');
    } catch (err) {
      onToast?.(err.message || 'No se pudo anular la venta.', 'error');
    }
  };

  const handlePaid = async (s) => {
    try {
      await markSalePaid(negocioId, s.id);
      onToast?.('Venta marcada como pagada.');
    } catch (err) {
      onToast?.(err.message || 'No se pudo actualizar la venta.', 'error');
    }
  };

  const typeLabel = (v) => PRODUCT_TYPES.find((x) => x.value === v)?.label || 'Para venta';

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Pestañas + sucursal */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-nexus-border">
        <div className="flex gap-6" role="tablist">
          {TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              onClick={() => setTab(x.id)}
              className={`relative h-10 px-1 text-sm font-semibold transition-colors cursor-pointer ${tab === x.id ? 'text-nexus-primary' : 'text-nexus-text-secondary hover:text-nexus-text'}`}
            >
              {x.label}
              {tab === x.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-nexus-primary" />}
            </button>
          ))}
        </div>
        {multi && (
          <div className="pb-2 sm:w-56">
            <Select aria-label="Sucursal" value={scope} onChange={(e) => setBranchKey(e.target.value)}>
              <option value="all">Todas las sucursales</option>
              {opts.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
            </Select>
          </div>
        )}
      </div>

      {/* ───────────── STOCK ───────────── */}
      {tab === 'stock' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Package} label="Productos" value={kpis.count} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
            <Kpi icon={Boxes} label="Unidades en stock" value={kpis.units} tone="success" />
            <Kpi icon={AlertCircle} label="Bajo stock" value={kpis.low} tone="warning" active={statusFilter === 'low'} onClick={() => setStatusFilter((s) => (s === 'low' ? 'all' : 'low'))} />
            <Kpi icon={XCircle} label="Agotados" value={kpis.out} tone="danger" active={statusFilter === 'out'} onClick={() => setStatusFilter((s) => (s === 'out' ? 'all' : 'out'))} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-nexus-text-muted" aria-hidden="true" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o SKU…" className="pl-9" aria-label="Buscar producto" />
              </div>
              <Select aria-label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} className="sm:w-52">
                <option value="all">Todas las categorías</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <Button icon={Plus} onClick={() => setProductModal({ product: null })} className="w-full sm:w-auto">Nuevo producto</Button>
          </div>

          {loadingProducts ? (
            <LoadingState />
          ) : (
            <ResponsiveTable
              rows={filteredProducts}
              rowKey={(p) => p.id}
              breakpoint="lg"
              empty={(
                <div className="rounded-xl border border-nexus-border bg-nexus-surface">
                  <EmptyState
                    icon={Package}
                    title={products.length ? 'Ningún producto coincide con el filtro' : 'Aún no hay productos'}
                    description={products.length ? 'Prueba con otra búsqueda o categoría.' : 'Registra tus productos para controlar el stock y vender.'}
                    action={!products.length && <Button icon={Plus} onClick={() => setProductModal({ product: null })}>Nuevo producto</Button>}
                  />
                </div>
              )}
              columns={[
                {
                  key: 'name',
                  header: 'Producto',
                  primary: true,
                  render: (p) => (
                    <span className="flex min-w-0 items-center gap-3">
                      {p.image ? (
                        <img src={cloudinaryThumb(p.image, 120)} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-nexus-border bg-nexus-background object-cover" loading="lazy" />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-nexus-border bg-nexus-background text-nexus-text-muted"><Package size={18} aria-hidden="true" /></span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-nexus-text">{p.name}</span>
                        <span className="block truncate text-xs text-nexus-text-muted">
                          {[p.category, p.sku].filter(Boolean).join(' · ')}{p.type && p.type !== 'venta' ? ` · ${typeLabel(p.type)}` : ''}
                        </span>
                      </span>
                    </span>
                  ),
                },
                {
                  key: 'stock',
                  header: 'Stock',
                  render: (p) => (
                    <span>
                      <span className="nx-num font-semibold">{stockOf(p, scope, branches)} uds</span>
                      {multi && scope === 'all' && (
                        <span className="block text-xs text-nexus-text-muted nx-num">
                          {opts.map((b) => `${b.name}: ${stockOf(p, b.key, branches)}`).join(' · ')}
                        </span>
                      )}
                    </span>
                  ),
                },
                { key: 'price', header: 'Precio', align: 'right', render: (p) => <span className="nx-num font-semibold text-nexus-primary">{p.type === 'insumo' ? '—' : money(p.price)}</span> },
                {
                  key: 'status',
                  header: 'Estado',
                  render: (p) => {
                    const st = STOCK_STATUS[stockStatus(p, scope, branches)];
                    return <Badge tone={st.tone}>{st.label}</Badge>;
                  },
                },
              ]}
              actions={(p) => (
                <>
                  <IconButton icon={SlidersHorizontal} tone="primary" label={`Ajustar stock de ${p.name}`} onClick={() => setStockModal({ product: p, mode: 'entrada' })} />
                  {multi && <IconButton icon={ArrowLeftRight} label={`Traspasar ${p.name}`} onClick={() => setStockModal({ product: p, mode: 'traspaso' })} />}
                  <IconButton icon={Pencil} label={`Editar ${p.name}`} onClick={() => setProductModal({ product: p })} />
                  <IconButton icon={Trash2} tone="danger" label={`Eliminar ${p.name}`} onClick={() => handleDelete(p)} />
                </>
              )}
            />
          )}
          {!loadingProducts && products.length > 0 && (
            <p className="text-xs text-nexus-text-muted nx-num">Valor del stock a precio de venta: {money(kpis.value)}</p>
          )}
        </div>
      )}

      {/* ───────────── VENTAS ───────────── */}
      {tab === 'ventas' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={TrendingUp} label="Ventas del mes" value={summary.count} />
            <Kpi icon={DollarSign} label="Cobrado" value={money(summary.income)} tone="success" />
            <Kpi icon={Clock} label="Por cobrar" value={money(summary.pending)} tone="warning" />
            <Kpi icon={CheckCircle2} label="Hoy" value={`${summary.todayCount} · ${money(summary.todayIncome)}`} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input type="month" aria-label="Mes" value={month} onChange={(e) => setMonth(e.target.value || currentMonth())} className="nx-num sm:w-48" />
            <Button icon={Plus} onClick={() => setSaleOpen(true)} className="w-full sm:w-auto" disabled={!products.length}>Nueva venta</Button>
          </div>

          {loadingSales ? (
            <LoadingState />
          ) : (
            <ResponsiveTable
              rows={visibleSales}
              rowKey={(s) => s.id}
              breakpoint="lg"
              empty={(
                <div className="rounded-xl border border-nexus-border bg-nexus-surface">
                  <EmptyState icon={TrendingUp} title="No hay ventas en este mes" description={products.length ? 'Registra una venta con el botón "Nueva venta".' : 'Primero registra productos en la pestaña Stock.'} />
                </div>
              )}
              columns={[
                {
                  key: 'client',
                  header: t('client'),
                  primary: true,
                  render: (s) => (
                    <span className={`font-semibold ${s.status === 'void' ? 'text-nexus-text-muted line-through' : 'text-nexus-text'}`}>{s.clientName || `${t('client')} general`}</span>
                  ),
                },
                { key: 'date', header: 'Fecha', render: (s) => <span className="nx-num">{fmtDate(s.date)}</span> },
                {
                  key: 'items',
                  header: 'Productos',
                  render: (s) => (
                    <span className="block whitespace-normal text-nexus-text-secondary">
                      {(s.items || []).map((it, i) => <span key={i} className="block">{it.name} ×{it.qty}</span>)}
                    </span>
                  ),
                },
                ...(multi ? [{ key: 'branch', header: 'Sucursal', render: (s) => s.branchName || '—' }] : []),
                { key: 'total', header: 'Total', align: 'right', render: (s) => <span className="nx-num font-bold text-nexus-text">{money(s.total)}</span> },
                { key: 'pay', header: 'Pago', render: (s) => s.paymentMethod || '—' },
                { key: 'status', header: 'Estado', render: (s) => { const st = SALE_STATUS[s.status] || SALE_STATUS.paid; return <Badge tone={st.tone}>{st.label}</Badge>; } },
              ]}
              actions={(s) => (s.status === 'void' ? null : (
                <>
                  {s.status === 'pending' && <IconButton icon={CheckCircle2} tone="primary" label="Marcar como pagada" onClick={() => handlePaid(s)} />}
                  <IconButton icon={Ban} tone="danger" label="Anular venta" onClick={() => handleVoid(s)} />
                </>
              ))}
            />
          )}
        </div>
      )}

      {/* ───────────── MOVIMIENTOS ───────────── */}
      {tab === 'movimientos' && (
        loadingMov ? <LoadingState /> : (
          <ResponsiveTable
            rows={visibleMovements}
            rowKey={(m) => m.id}
            breakpoint="lg"
            empty={(
              <div className="rounded-xl border border-nexus-border bg-nexus-surface">
                <EmptyState icon={History} title="Sin movimientos todavía" description="Aquí aparecen entradas, salidas, traspasos y ventas." />
              </div>
            )}
            columns={[
              { key: 'product', header: 'Producto', primary: true, render: (m) => <span className="font-semibold text-nexus-text">{m.productName || '—'}</span> },
              { key: 'when', header: 'Fecha', render: (m) => <span className="nx-num">{fmtTs(m.createdAt)}</span> },
              { key: 'type', header: 'Tipo', render: (m) => MOVEMENT_LABELS[m.type] || m.type },
              ...(multi ? [{ key: 'branch', header: 'Sucursal', render: (m) => (m.type === 'traspaso' ? `${m.branchName} → ${m.toBranchName}` : m.branchName || '—') }] : []),
              {
                key: 'qty',
                header: 'Cambio',
                align: 'right',
                render: (m) => {
                  const n = Number(m.qty) || 0;
                  const shown = m.type === 'traspaso' ? `${n}` : `${n > 0 ? '+' : ''}${n}`;
                  return <span className={`nx-num font-semibold ${m.type === 'traspaso' ? 'text-nexus-text' : n < 0 ? 'text-nexus-error-text' : 'text-nexus-success-text'}`}>{shown}</span>;
                },
              },
              { key: 'after', header: 'Quedó', align: 'right', render: (m) => <span className="nx-num">{m.after ?? '—'}</span> },
              { key: 'reason', header: 'Motivo', render: (m) => <span className="text-nexus-text-secondary">{m.reason || (m.saleId ? 'Venta' : '—')}</span> },
            ]}
          />
        )
      )}

      {productModal && (
        <ProductModal
          negocioId={negocioId}
          product={productModal.product}
          categories={categories}
          branches={branches}
          uid={uid}
          onClose={() => setProductModal(null)}
          onToast={onToast}
        />
      )}
      {stockModal && (
        <StockModal
          negocioId={negocioId}
          product={products.find((p) => p.id === stockModal.product.id) || stockModal.product}
          branches={branches}
          initialBranch={scope === 'all' ? null : scope}
          initialMode={stockModal.mode}
          uid={uid}
          onClose={() => setStockModal(null)}
          onToast={onToast}
        />
      )}
      {saleOpen && (
        <SaleModal
          negocioId={negocioId}
          products={products}
          branches={branches}
          clients={clients}
          paymentMethods={businessSettings?.paymentMethods || []}
          initialBranch={scope === 'all' ? null : scope}
          uid={uid}
          onClose={() => setSaleOpen(false)}
          onToast={onToast}
        />
      )}
      {confirmDialog}
    </div>
  );
}
