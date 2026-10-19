// inventoryApi.js
// Escrituras de inventario y ventas en Firestore. Todo lo que mueve stock
// va en una TRANSACCIÓN: dos ventas al mismo tiempo no pueden vender la
// misma unidad, y cada cambio deja su registro en movimientosInventario.
// Ver la forma de los datos en inventoryModel.js.

import {
    collection, doc, updateDoc, deleteDoc, runTransaction, serverTimestamp, deleteField,
  } from 'firebase/firestore';
  import { db } from '../../firebase/config';
  import {
    GENERAL_KEY, branchOptions, stockOf, toInt, cleanProduct,
  } from './inventoryModel';
  
  const productosCol = (negocioId) => collection(db, 'negocios', negocioId, 'productos');
  const ventasCol = (negocioId) => collection(db, 'negocios', negocioId, 'ventas');
  const movCol = (negocioId) => collection(db, 'negocios', negocioId, 'movimientosInventario');
  
  // Campos a actualizar al dejar el stock de `key` en `next`. Si el negocio
  // pasó de no tener sucursales a tener UNA, el stock viejo en 'general' se
  // junta en esa sucursal (stockOf ya lo sumaba) y se borra la clave vieja.
  function stockFields(product, key, next, branches) {
    const fields = { [`stock.${key}`]: next };
    const opts = branchOptions(branches);
    if (key !== GENERAL_KEY && opts.length === 1 && opts[0].key === key && product?.stock && GENERAL_KEY in product.stock) {
      fields[`stock.${GENERAL_KEY}`] = deleteField();
    }
    return fields;
  }
  
  const branchNameOf = (branches, key) => branchOptions(branches).find((b) => b.key === key)?.name || 'General';
  
  function movement(tx, negocioId, data) {
    tx.set(doc(movCol(negocioId)), { ...data, createdAt: serverTimestamp() });
  }
  
  /** Crea o edita un producto. En el alta, `initialStock` = { [sucursalKey]: cantidad }. */
  export async function saveProduct(negocioId, productId, form, { initialStock = {}, branches = [], uid = null } = {}) {
    const data = cleanProduct(form);
    if (!data.name) throw new Error('El producto necesita un nombre.');
  
    if (productId) {
      await updateDoc(doc(productosCol(negocioId), productId), { ...data, updatedAt: serverTimestamp() });
      return productId;
    }
  
    const stock = {};
    for (const b of branchOptions(branches)) {
      stock[b.key] = Math.max(0, toInt(initialStock[b.key]));
    }
    const ref = doc(productosCol(negocioId));
    await runTransaction(db, async (tx) => {
      tx.set(ref, { ...data, stock, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      for (const [key, qty] of Object.entries(stock)) {
        if (qty > 0) {
          movement(tx, negocioId, {
            type: 'entrada', productId: ref.id, productName: data.name,
            branchKey: key, branchName: branchNameOf(branches, key),
            qty, before: 0, after: qty, reason: 'Stock inicial', createdBy: uid,
          });
        }
      }
    });
    return ref.id;
  }
  
  export async function deleteProduct(negocioId, productId) {
    await deleteDoc(doc(productosCol(negocioId), productId));
  }
  
  /**
   * Ajuste manual en una sucursal.
   * mode: 'entrada' (suma), 'salida' (resta), 'conteo' (fija la cantidad contada).
   */
  export async function adjustStock(negocioId, { productId, branchKey, mode, qty, reason = '', branches = [], uid = null }) {
    const amount = Math.max(0, toInt(qty));
    if (mode !== 'conteo' && amount <= 0) throw new Error('Ingresa una cantidad mayor a 0.');
    const ref = doc(productosCol(negocioId), productId);
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('El producto ya no existe.');
      const product = { id: snap.id, ...snap.data() };
      const before = stockOf(product, branchKey, branches);
      let after = before;
      if (mode === 'entrada') after = before + amount;
      else if (mode === 'salida') after = before - amount;
      else after = amount;
      if (after < 0) throw new Error(`Solo hay ${before} unidades en esta sucursal.`);
      tx.update(ref, { ...stockFields(product, branchKey, after, branches), updatedAt: serverTimestamp() });
      movement(tx, negocioId, {
        type: mode, productId, productName: product.name || '',
        branchKey, branchName: branchNameOf(branches, branchKey),
        qty: after - before, before, after, reason: String(reason || '').slice(0, 120), createdBy: uid,
      });
      return after;
    });
  }
  
  /** Mueve unidades de una sucursal a otra. */
  export async function transferStock(negocioId, { productId, fromKey, toKey, qty, branches = [], uid = null, reason = '' }) {
    const amount = Math.max(0, toInt(qty));
    if (amount <= 0) throw new Error('Ingresa una cantidad mayor a 0.');
    if (!fromKey || !toKey || fromKey === toKey) throw new Error('Elige dos sucursales distintas.');
    const ref = doc(productosCol(negocioId), productId);
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('El producto ya no existe.');
      const product = { id: snap.id, ...snap.data() };
      const fromBefore = stockOf(product, fromKey, branches);
      const toBefore = stockOf(product, toKey, branches);
      if (amount > fromBefore) throw new Error(`Solo hay ${fromBefore} unidades en ${branchNameOf(branches, fromKey)}.`);
      tx.update(ref, {
        [`stock.${fromKey}`]: fromBefore - amount,
        [`stock.${toKey}`]: toBefore + amount,
        updatedAt: serverTimestamp(),
      });
      movement(tx, negocioId, {
        type: 'traspaso', productId, productName: product.name || '',
        branchKey: fromKey, branchName: branchNameOf(branches, fromKey),
        toBranchKey: toKey, toBranchName: branchNameOf(branches, toKey),
        qty: amount, before: fromBefore, after: fromBefore - amount,
        reason: String(reason || '').slice(0, 120), createdBy: uid,
      });
    });
  }
  
  /**
   * Registra una venta y descuenta el stock de la sucursal. Falla (sin
   * guardar nada) si algún producto no tiene stock suficiente.
   * items: [{ productId, name, price, qty, subtotal }] (de buildSaleItems).
   */
  export async function createSale(negocioId, sale, { branches = [], uid = null } = {}) {
    const { items = [], branchKey } = sale;
    if (!items.length) throw new Error('Agrega al menos un producto.');
    if (!branchKey) throw new Error('Elige la sucursal de la venta.');
    const saleRef = doc(ventasCol(negocioId));
    const branchName = branchNameOf(branches, branchKey);
  
    await runTransaction(db, async (tx) => {
      const refs = items.map((i) => doc(productosCol(negocioId), i.productId));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      const products = snaps.map((s, idx) => {
        if (!s.exists()) throw new Error(`"${items[idx].name}" ya no existe en el inventario.`);
        return { id: s.id, ...s.data() };
      });
      products.forEach((p, idx) => {
        const have = stockOf(p, branchKey, branches);
        if (items[idx].qty > have) throw new Error(`Stock insuficiente de "${p.name}": quedan ${have} en ${branchName}.`);
      });
      products.forEach((p, idx) => {
        const before = stockOf(p, branchKey, branches);
        const after = before - items[idx].qty;
        tx.update(refs[idx], { ...stockFields(p, branchKey, after, branches), updatedAt: serverTimestamp() });
        movement(tx, negocioId, {
          type: 'venta', productId: p.id, productName: p.name || '',
          branchKey, branchName, qty: -items[idx].qty, before, after,
          reason: '', saleId: saleRef.id, createdBy: uid,
        });
      });
      const total = Math.round(items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0) * 100) / 100;
      tx.set(saleRef, {
        date: sale.date,
        branchKey,
        branchName,
        clientId: sale.clientId || null,
        clientName: (sale.clientName || '').trim() || 'Cliente general',
        items,
        total,
        paymentMethod: sale.paymentMethod || 'Efectivo',
        status: sale.status === 'pending' ? 'pending' : 'paid',
        notes: String(sale.notes || '').slice(0, 500),
        createdBy: uid,
        createdAt: serverTimestamp(),
        ...(sale.status === 'pending' ? {} : { paidAt: serverTimestamp() }),
      });
    });
    return saleRef.id;
  }
  
  export async function markSalePaid(negocioId, saleId, paymentMethod) {
    await updateDoc(doc(ventasCol(negocioId), saleId), {
      status: 'paid',
      paidAt: serverTimestamp(),
      ...(paymentMethod ? { paymentMethod } : {}),
    });
  }
  
  /** Anula una venta y devuelve las unidades a la sucursal donde se vendieron. */
  export async function voidSale(negocioId, saleId, { branches = [], uid = null } = {}) {
    const saleRef = doc(ventasCol(negocioId), saleId);
    await runTransaction(db, async (tx) => {
      const saleSnap = await tx.get(saleRef);
      if (!saleSnap.exists()) throw new Error('La venta ya no existe.');
      const sale = saleSnap.data();
      if (sale.status === 'void') throw new Error('La venta ya estaba anulada.');
      const items = Array.isArray(sale.items) ? sale.items : [];
      const refs = items.map((i) => doc(productosCol(negocioId), i.productId));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      snaps.forEach((s, idx) => {
        if (!s.exists()) return; // producto eliminado: no hay stock que devolver
        const p = { id: s.id, ...s.data() };
        const before = stockOf(p, sale.branchKey, branches);
        const after = before + toInt(items[idx].qty);
        tx.update(refs[idx], { ...stockFields(p, sale.branchKey, after, branches), updatedAt: serverTimestamp() });
        movement(tx, negocioId, {
          type: 'anulacion', productId: p.id, productName: p.name || '',
          branchKey: sale.branchKey, branchName: sale.branchName || '',
          qty: toInt(items[idx].qty), before, after, reason: '', saleId, createdBy: uid,
        });
      });
      tx.update(saleRef, { status: 'void', voidedAt: serverTimestamp(), voidedBy: uid });
    });
  }
  