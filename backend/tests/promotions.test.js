// Promociones: cálculo puro (descuentos, combos, vigencia, días, sucursales,
// la mejor gana) y que la copia del backend dé lo mismo que la del navegador.
// Ejecutar:  cd backend && npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as back from '../services/pricing/promotionPricing.js';
import * as front from '../../src/shared/promotions/promotionPricing.js';
import { calculateCommissionForCita } from '../services/finance/commissionModel.js';

const linea = (serviceId, price, extra = {}) => ({ serviceId, serviceName: serviceId, price, listPrice: price, basePrice: price, priceSource: 'base', priceVariable: false, duration: 30, ...extra });
const JUEVES = '2026-10-29';
const base = { active: true, startDate: '2026-10-01', endDate: null, weekdays: [], branchIds: [], commissionBase: 'final' };
const desc20 = { ...base, id: 'd20', name: '20% corte', type: 'descuento', serviceIds: ['corte'], discountKind: 'percent', discountValue: 20 };
const menos10 = { ...base, id: 'm10', name: 'Bs 10 menos', type: 'descuento', serviceIds: ['corte', 'barba'], discountKind: 'amount', discountValue: 10 };
const combo = { ...base, id: 'cb', name: 'Corte + barba', type: 'combo', serviceIds: ['corte', 'barba'], comboPrice: 70 };

for (const [nombre, M] of [['backend', back], ['navegador', front]]) {
  describe(`promociones (${nombre})`, () => {
    test('descuento en % sobre el precio de la línea (ya con precio del profesional)', () => {
      const r = M.applyPromotions([linea('corte', 120), linea('cejas', 30)], [desc20], { date: JUEVES });
      assert.equal(r.services[0].price, 96);
      assert.equal(r.services[0].prePromoPrice, 120);
      assert.equal(r.services[0].promoId, 'd20');
      assert.equal(r.services[1].price, 30);
      assert.equal(r.services[1].promoId, undefined);
      assert.deepEqual(r.promo, { id: 'd20', name: '20% corte', type: 'descuento', commissionBase: 'final', discount: 24 });
    });

    test('descuento en Bs nunca deja el precio en negativo', () => {
      const r = M.applyPromotions([linea('corte', 8)], [menos10], { date: JUEVES });
      assert.equal(r.services[0].price, 0);
    });

    test('combo: solo con todos sus servicios, repartido según el precio', () => {
      const r = M.applyPromotions([linea('corte', 60), linea('barba', 40)], [combo], { date: JUEVES });
      assert.equal(r.services[0].price + r.services[1].price, 70);
      assert.equal(r.services[0].price, 42);
      assert.equal(r.services[1].price, 28);
      assert.equal(r.promo.discount, 30);
      assert.equal(M.applyPromotions([linea('corte', 60)], [combo], { date: JUEVES }).promo, null);
    });

    test('combo más caro que lo normal no se aplica', () => {
      assert.equal(M.applyPromotions([linea('corte', 30), linea('barba', 30)], [combo], { date: JUEVES }).promo, null);
    });

    test('gana la que más ahorra y no se suman', () => {
      const lineas = [linea('corte', 60), linea('barba', 40)];
      // combo ahorra 30; 20% en corte ahorra 12; Bs 10 menos en ambos ahorra 20.
      const r = M.applyPromotions(lineas, [desc20, menos10, combo], { date: JUEVES });
      assert.equal(r.promo.id, 'cb');
      assert.equal(r.services.reduce((s, l) => s + l.price, 0), 70);
    });

    test('vigencia, días, pausa y sucursal', () => {
      const l = [linea('corte', 100)];
      assert.equal(M.applyPromotions(l, [{ ...desc20, startDate: '2026-11-01' }], { date: JUEVES }).promo, null);
      assert.equal(M.applyPromotions(l, [{ ...desc20, endDate: '2026-10-28' }], { date: JUEVES }).promo, null);
      assert.equal(M.applyPromotions(l, [{ ...desc20, endDate: JUEVES }], { date: JUEVES }).promo.id, 'd20');
      assert.equal(M.applyPromotions(l, [{ ...desc20, weekdays: [2] }], { date: JUEVES }).promo, null); // martes
      assert.equal(M.applyPromotions(l, [{ ...desc20, weekdays: [4] }], { date: JUEVES }).promo.id, 'd20'); // jueves
      assert.equal(M.applyPromotions(l, [{ ...desc20, active: false }], { date: JUEVES }).promo, null);
      assert.equal(M.applyPromotions(l, [{ ...desc20, branchIds: ['s1'] }], { date: JUEVES, branchId: 's2' }).promo, null);
      assert.equal(M.applyPromotions(l, [{ ...desc20, branchIds: ['s1'] }], { date: JUEVES, branchId: 's1' }).promo.id, 'd20');
      assert.equal(M.applyPromotions(l, [{ ...desc20, branchIds: ['s1'] }], { date: JUEVES }).promo, null);
    });

    test('el precio variable ("Desde") no entra en promociones', () => {
      const r = M.applyPromotions([linea('corte', 100, { priceVariable: true })], [desc20], { date: JUEVES });
      assert.equal(r.promo, null);
      assert.equal(r.services[0].price, 100);
    });

    test('recalcular no acumula: primero vuelve al precio sin promo', () => {
      const una = M.applyPromotions([linea('corte', 100)], [desc20], { date: JUEVES });
      const otra = M.applyPromotions(una.services, [desc20], { date: JUEVES });
      assert.equal(otra.services[0].price, 80);
      const sin = M.applyPromotions(una.services, [], { date: JUEVES });
      assert.equal(sin.services[0].price, 100);
      assert.equal(sin.services[0].prePromoPrice, undefined);
      assert.equal(sin.promo, null);
    });

    test('Pendiente: el rango de precios baja en la misma proporción', () => {
      const r = M.applyPromotions([linea('corte', 100, { priceSource: 'pending', priceRange: { min: 100, max: 150 } })], [desc20], { date: JUEVES });
      assert.deepEqual(r.services[0].priceRange, { min: 80, max: 120 });
    });

    test('sucursal por nombre', () => {
      assert.equal(M.resolveBranchId('Central', [{ id: 's1', name: 'Central' }]), 's1');
      assert.equal(M.resolveBranchId('Otra', [{ id: 's1', name: 'Central' }]), null);
    });
  });
}

describe('comisión con promo', () => {
  const barber = { services: [{ serviceId: 'corte', commissionEnabled: true, type: '%', value: 50 }] };
  test('sobre el precio con promo (por defecto) o sobre el normal', () => {
    const { services, promo } = back.applyPromotions([linea('corte', 100)], [desc20], { date: JUEVES });
    assert.equal(calculateCommissionForCita({ services, promo }, barber).totalAmount, 40);
    const normal = { ...promo, commissionBase: 'normal' };
    assert.equal(calculateCommissionForCita({ services, promo: normal }, barber).totalAmount, 50);
  });
});

test('las dos copias del cálculo son iguales (salvo el encabezado)', async () => {
  const { readFileSync } = await import('node:fs');
  const a = readFileSync(new URL('../../src/shared/promotions/promotionPricing.js', import.meta.url), 'utf8');
  const b = readFileSync(new URL('../services/pricing/promotionPricing.js', import.meta.url), 'utf8');
  assert.equal(b.slice(b.indexOf(a.slice(0, 40))), a);
});
