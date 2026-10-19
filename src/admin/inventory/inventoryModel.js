// inventoryModel.js
// Lógica pura (sin Firebase) del inventario y ventas de productos.
//
// Firestore:
//   negocios/{id}/productos/{productoId}
//     { name, category, sku, type: 'venta'|'insumo'|'ambos', description,
//       price, cost|null, minStock, image, stock: { [sucursalKey]: number },
//       createdAt, updatedAt }
//   negocios/{id}/ventas/{ventaId}
//     { date 'AAAA-MM-DD' (hora local), branchKey, branchName,
//       clientId|null, clientName, items: [{ productId, name, price, qty, subtotal }],
//       total, paymentMethod, status: 'paid'|'pending'|'void', notes,
//       createdBy, createdAt, paidAt?, voidedAt? }
//   negocios/{id}/movimientosInventario/{id}
//     { type: 'entrada'|'salida'|'conteo'|'traspaso'|'venta'|'anulacion',
//       productId, productName, branchKey, branchName, toBranchKey?, toBranchName?,
//       qty (cambio con signo; en traspaso, cantidad movida), before, after,
//       reason, saleId?, createdBy, createdAt }
//
// Stock POR SUCURSAL: la clave es el id de la sucursal (estable aunque se
// renombre). Un negocio sin sucursales usa la clave 'general'.

export const GENERAL_KEY = 'general';

export const PRODUCT_TYPES = [
  { value: 'venta', label: 'Para venta' },
  { value: 'insumo', label: 'Insumo interno' },
  { value: 'ambos', label: 'Venta e insumo' },
];

export const SALE_STATUS = {
  paid: { label: 'Pagada', tone: 'success' },
  pending: { label: 'Por cobrar', tone: 'warning' },
  void: { label: 'Anulada', tone: 'danger' },
};

export const MOVEMENT_LABELS = {
  entrada: 'Entrada',
  salida: 'Salida',
  conteo: 'Conteo',
  traspaso: 'Traspaso',
  venta: 'Venta',
  anulacion: 'Venta anulada',
};

export const ADJUST_REASONS = {
  entrada: ['Compra / reposición', 'Devolución de cliente', 'Otro'],
  salida: ['Uso interno', 'Producto dañado / vencido', 'Regalo / muestra', 'Otro'],
  conteo: ['Conteo físico'],
};

const pad = (n) => String(n).padStart(2, '0');
export const todayLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const currentMonth = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export function monthRange(ym) {
  const [y, m] = String(ym || currentMonth()).split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
}

export const money = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(2)} Bs`;
};

/** Sucursales del negocio como [{ key, name }]. Sin sucursales: una "general". */
export function branchOptions(branches = []) {
  const list = (branches || []).filter((b) => b?.id).map((b) => ({ key: b.id, name: b.name || 'Sucursal' }));
  return list.length ? list : [{ key: GENERAL_KEY, name: 'General' }];
}

/** Clave de stock a usar si el negocio tiene una sola sucursal (o ninguna). */
export function defaultBranchKey(branches = []) {
  return branchOptions(branches)[0].key;
}

export function toInt(v, fallback = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Stock de un producto en una sucursal ('all' = suma de todas las
 * sucursales actuales). Si el negocio tenía stock en 'general' y después
 * creó su primera sucursal, ese stock se cuenta en la única sucursal.
 */
export function stockOf(product, branchKey, branches = []) {
  const stock = product?.stock && typeof product.stock === 'object' ? product.stock : {};
  const opts = branchOptions(branches);
  const legacyGeneral = opts.length === 1 && opts[0].key !== GENERAL_KEY ? toInt(stock[GENERAL_KEY]) : 0;
  if (branchKey === 'all') {
    // 'general' sin sucursales reales también se suma, para que nunca quede oculto.
    const extraGeneral = opts.some((b) => b.key === GENERAL_KEY) ? 0 : toInt(stock[GENERAL_KEY]);
    return opts.reduce((sum, b) => sum + toInt(stock[b.key]), 0) + extraGeneral;
  }
  return toInt(stock[branchKey]) + (opts.length === 1 && branchKey === opts[0].key ? legacyGeneral : 0);
}

/** 'ok' | 'low' | 'out' en el alcance pedido. En 'all', bajo si alguna sucursal está baja. */
export function stockStatus(product, branchKey, branches = []) {
  const min = Math.max(0, toInt(product?.minStock));
  if (branchKey !== 'all') {
    const s = stockOf(product, branchKey, branches);
    if (s <= 0) return 'out';
    return s <= min ? 'low' : 'ok';
  }
  const total = stockOf(product, 'all', branches);
  if (total <= 0) return 'out';
  const anyLow = branchOptions(branches).some((b) => stockOf(product, b.key, branches) <= min);
  return anyLow ? 'low' : 'ok';
}

export const STOCK_STATUS = {
  ok: { label: 'Disponible', tone: 'success' },
  low: { label: 'Bajo stock', tone: 'warning' },
  out: { label: 'Agotado', tone: 'danger' },
};

export const isSellable = (p) => (p?.type || 'venta') !== 'insumo';

/** Normaliza el formulario de producto antes de guardar (sin stock: se maneja aparte). */
export function cleanProduct(form) {
  const cost = form.cost === '' || form.cost === null || form.cost === undefined ? null : Math.max(0, Number(form.cost) || 0);
  return {
    name: String(form.name || '').trim().slice(0, 120),
    category: String(form.category || '').trim().slice(0, 60) || 'General',
    sku: String(form.sku || '').trim().slice(0, 40),
    type: PRODUCT_TYPES.some((t) => t.value === form.type) ? form.type : 'venta',
    description: String(form.description || '').trim().slice(0, 500),
    price: Math.max(0, Number(form.price) || 0),
    cost,
    minStock: Math.max(0, toInt(form.minStock, 0)),
    image: typeof form.image === 'string' ? form.image.trim() : '',
  };
}

/** Agrupa ítems repetidos (mismo producto) y calcula subtotales/total. */
export function buildSaleItems(rows, productsById) {
  const map = new Map();
  for (const r of rows || []) {
    const p = productsById[r.productId];
    const qty = Math.max(0, toInt(r.qty));
    if (!p || qty <= 0) continue;
    const prev = map.get(p.id);
    const price = Math.max(0, Number(r.price ?? p.price) || 0);
    if (prev) prev.qty += qty;
    else map.set(p.id, { productId: p.id, name: p.name, price, qty });
  }
  const items = [...map.values()].map((i) => ({ ...i, subtotal: Math.round(i.price * i.qty * 100) / 100 }));
  const total = Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
  return { items, total };
}

export function salesSummary(sales = [], today = todayLocal()) {
  const valid = sales.filter((s) => s.status !== 'void');
  const sum = (list) => list.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  const todayList = valid.filter((s) => s.date === today);
  return {
    count: valid.length,
    income: sum(valid.filter((s) => s.status === 'paid')),
    pending: sum(valid.filter((s) => s.status === 'pending')),
    todayCount: todayList.length,
    todayIncome: sum(todayList.filter((s) => s.status === 'paid')),
  };
}
