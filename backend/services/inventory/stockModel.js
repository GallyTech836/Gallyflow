// stockModel.js — Copia del cálculo de stock por sucursal del frontend
// (src/admin/inventory/inventoryModel.js). Si cambia uno, cambiar el otro.
//
// Stock POR SUCURSAL: la clave es el id de la sucursal. Un negocio sin
// sucursales usa 'general'. Si el negocio tenía stock en 'general' y después
// creó su primera sucursal, ese stock se cuenta en la única sucursal.

export const GENERAL_KEY = 'general';

export function toInt(v, fallback = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

/** Sucursales como [{ key, name }]. Sin sucursales: una "general". */
export function branchOptions(branches = []) {
  const list = (branches || []).filter((b) => b?.id).map((b) => ({ key: b.id, name: b.name || 'Sucursal' }));
  return list.length ? list : [{ key: GENERAL_KEY, name: 'General' }];
}

export function stockOf(product, branchKey, branches = []) {
  const stock = product?.stock && typeof product.stock === 'object' ? product.stock : {};
  const opts = branchOptions(branches);
  const legacyGeneral = opts.length === 1 && opts[0].key !== GENERAL_KEY ? toInt(stock[GENERAL_KEY]) : 0;
  return toInt(stock[branchKey]) + (opts.length === 1 && branchKey === opts[0].key ? legacyGeneral : 0);
}

/** ¿Hay que borrar la clave vieja 'general' al escribir en `key`? */
export function dropsLegacyGeneral(product, key, branches = []) {
  const opts = branchOptions(branches);
  return key !== GENERAL_KEY && opts.length === 1 && opts[0].key === key && !!product?.stock && GENERAL_KEY in product.stock;
}
