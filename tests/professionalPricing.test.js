// Pruebas del módulo de precio por profesional (funciones puras) y de que la
// copia del backend sea idéntica en comportamiento a la del front.
//
// Ejecutar (desde la raíz):  npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as front from '../src/shared/servicePricing/professionalPricing.js';
import * as back from '../backend/services/pricing/professionalPricing.js';
import { formatServicePriceFor, formatAmountRange, formatServicePrice } from '../src/shared/servicePricing/servicePricing.js';
import { calculateCommissionForCita } from '../src/shared/commissions/commissionModel.js';

const corte = { id: 's1', name: 'Corte', price: 100, duration: 30 };
const barba = { id: 's2', name: 'Barba', price: 50, duration: 30 };
const color = { id: 's3', name: 'Color', price: 200, priceVariable: true, duration: 60 };
const promo = { id: 'sr', name: 'Promo', price: 80, promoPrice: 60, duration: 30 };
const catalog = [corte, barba, color, promo];

const ana = { id: 'ana', name: 'Ana', active: true, services: [
  { serviceId: 's1', commissionEnabled: true, type: '%', value: 40, customPrice: 150 },
  { serviceId: 's2', commissionEnabled: true, type: 'Bs', value: 10 },
  { serviceId: 's3', commissionEnabled: true, type: '%', value: 50, customPrice: 250 },
  { serviceId: 'sr', customPrice: 70 },
] };
const beto = { id: 'beto', name: 'Beto', active: true, services: [
  { serviceId: 's1', commissionEnabled: true, type: '%', value: 40 },
  { serviceId: 's2' },
  { serviceId: 'sr' },
] };
const legacyStrings = { id: 'leo', name: 'Leo', active: true, services: ['s1', 's2'] };
const inactiva = { id: 'ina', name: 'Inactiva', active: false, services: [{ serviceId: 's1', customPrice: 10 }] };

function hasUndefined(v) {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.some(hasUndefined);
  if (v && typeof v === 'object') return Object.values(v).some(hasUndefined);
  return false;
}

describe('resolveServicePrice', () => {
  test('precio del profesional > promo > base', () => {
    assert.equal(front.resolveServicePrice(corte, ana).price, 150);
    assert.equal(front.resolveServicePrice(corte, ana).source, 'professional');
    assert.equal(front.resolveServicePrice(corte, beto).price, 100);
    assert.equal(front.resolveServicePrice(corte, beto).source, 'base');
    assert.equal(front.resolveServicePrice(corte, null).price, 100);
    assert.equal(front.resolveServicePrice(promo, beto, { promoActive: true }).price, 60);
    assert.equal(front.resolveServicePrice(promo, beto, { promoActive: true }).source, 'promo');
    assert.equal(front.resolveServicePrice(promo, ana, { promoActive: true }).price, 70, 'el precio propio gana a la promo');
    assert.equal(front.resolveServicePrice(promo, beto, { promoActive: (s) => s.id === 'otro' }).price, 80);
  });

  test('precio personalizado inválido o vacío => precio base; 0 es válido', () => {
    const p = (customPrice) => ({ id: 'x', services: [{ serviceId: 's1', customPrice }] });
    for (const raw of [null, undefined, '', '  ', 'abc', -5, NaN, true]) {
      assert.equal(front.resolveServicePrice(corte, p(raw)).price, 100, `raw=${String(raw)}`);
    }
    assert.equal(front.resolveServicePrice(corte, p(0)).price, 0);
    assert.equal(front.resolveServicePrice(corte, p('120')).price, 120);
    assert.equal(front.resolveServicePrice(corte, p(99.999)).price, 100);
  });

  test('profesionales legacy con services como strings usan el precio base', () => {
    assert.equal(front.resolveServicePrice(corte, legacyStrings).price, 100);
    assert.ok(front.getServiceAssignment(legacyStrings, 's1'));
  });
});

describe('rango de precios', () => {
  test('mínimo y máximo entre quienes hacen el servicio (sin inactivos ni "pending")', () => {
    const pros = [ana, beto, inactiva, { id: 'pending', isPending: true, services: [] }];
    assert.deepEqual(front.getServicePriceRange(corte, pros), { min: 100, max: 150, priceVariable: false });
    assert.deepEqual(front.getServicePriceRange(color, pros), { min: 250, max: 250, priceVariable: true });
    assert.deepEqual(front.getServicePriceRange(corte, []), { min: 100, max: 100, priceVariable: false });
  });

  test('hasCustomPrices', () => {
    assert.equal(front.hasCustomPrices(corte, [ana, beto]), true);
    assert.equal(front.hasCustomPrices(barba, [ana, beto]), false);
    assert.equal(front.hasCustomPrices(corte, [inactiva]), false);
  });
});

describe('services[] de la cita', () => {
  test('con profesional: precio aplicado + datos históricos, sin undefined', () => {
    const r = front.buildCitaServices([corte, barba], { professional: ana });
    assert.equal(r.totalPrice, 200);
    assert.equal(r.totalDuration, 60);
    assert.equal(r.priceProvisional, false);
    assert.deepEqual(r.services[0], {
      serviceId: 's1', serviceName: 'Corte', price: 150, duration: 30,
      listPrice: 150, basePrice: 100, priceSource: 'professional', priceVariable: false,
    });
    assert.equal(hasUndefined(r), false);
  });

  test('Pendiente: guarda el mínimo y el rango; total con min y max', () => {
    const r = front.buildCitaServices([corte, barba], { candidates: [ana, beto] });
    assert.equal(r.totalPrice, 150);
    assert.equal(r.priceMin, 150);
    assert.equal(r.priceMax, 200);
    assert.equal(r.priceProvisional, true);
    assert.deepEqual(r.services[0].priceRange, { min: 100, max: 150 });
    assert.equal(hasUndefined(r), false);
  });

  test('duraciones ajustadas y duración de ClienteApp ("30 min" + durationMin)', () => {
    const r = front.buildCitaServices([corte], { professional: beto, durations: { s1: 45 } });
    assert.equal(r.services[0].duration, 45);
    const cliente = { id: 's1', name: 'Corte', price: 100, duration: '40 min', durationMin: 40 };
    assert.equal(front.buildCitaService(cliente, beto).duration, 40);
  });

  test('asignar una Pendiente recalcula con el precio del profesional y quita el rango', () => {
    const pendiente = front.buildCitaServices([corte, barba], { candidates: [ana, beto] }).services;
    pendiente[0].duration = 50; // duración ajustada a mano: se conserva
    const r = front.repriceCitaServices(pendiente, catalog, ana);
    assert.equal(r.totalPrice, 200);
    assert.equal(r.priceProvisional, false);
    assert.equal(r.services[0].priceRange, undefined);
    assert.equal(r.services[0].duration, 50);
    assert.equal(hasUndefined(r), false);
  });

  test('volver a Pendiente recalcula el rango', () => {
    const conAna = front.buildCitaServices([corte], { professional: ana }).services;
    const r = front.repriceCitaServices(conAna, catalog, null, { candidates: [ana, beto] });
    assert.equal(r.priceProvisional, true);
    assert.equal(r.totalPrice, 100);
    assert.deepEqual(r.services[0].priceRange, { min: 100, max: 150 });
  });

  test('servicio borrado del catálogo: conserva el precio guardado', () => {
    const viejo = [{ serviceId: 'borrado', serviceName: 'Viejo', price: 77, duration: 30, priceSource: 'pending', priceRange: { min: 77, max: 90 } }];
    const r = front.repriceCitaServices(viejo, catalog, ana);
    assert.equal(r.totalPrice, 77);
    assert.equal(r.services[0].priceRange, undefined);
    assert.equal(r.services[0].priceSource, 'base');
  });

  test('cita legacy (sin campos nuevos) se resume igual que antes', () => {
    const s = front.summarizeCitaServices([{ serviceId: 's1', price: 100 }, { serviceId: 's2', price: '50' }]);
    assert.equal(s.totalPrice, 150);
    assert.equal(s.totalDuration, 60);
    assert.equal(s.priceProvisional, false);
  });
});

describe('precio variable ("Desde")', () => {
  test('el mínimo es el guardado al reservar aunque el catálogo cambie', () => {
    const [linea] = front.buildCitaServices([color], { professional: ana }).services;
    const colorCaro = { ...color, price: 999 };
    assert.equal(front.getMinimumPrice(linea, colorCaro, ana), 250);
  });

  test('cita vieja sin listPrice: usa el catálogo resuelto para el profesional', () => {
    const vieja = { serviceId: 's3', serviceName: 'Color', price: 200 };
    assert.equal(front.getMinimumPrice(vieja, color, ana), 250);
    assert.equal(front.getMinimumPrice(vieja, color, null), 200);
    assert.equal(front.getMinimumPrice(vieja, null, null), 200);
  });

  test('precio final: los fijos se conservan y el variable absorbe la diferencia', () => {
    const servicios = front.buildCitaServices([corte, color], { professional: ana }).services;
    const isVar = (cs) => cs.priceVariable === true;
    const min = (cs) => front.getMinimumPrice(cs, null, null);
    const conFinal = front.distributeFinalPrice(servicios, 500, isVar, min);
    assert.equal(conFinal[0].price, 150);
    assert.equal(conFinal[1].price, 350);
    assert.equal(conFinal[1].listPrice, 250, 'listPrice (mínimo histórico) no cambia');
    const vacio = front.distributeFinalPrice(conFinal, '', isVar, min);
    assert.equal(vacio[1].price, 250, 'sin precio final vuelve al mínimo');
    const menor = front.distributeFinalPrice(servicios, 100, isVar, min);
    assert.equal(menor[1].price, 0, 'nunca negativo');
  });
});

describe('comisiones usan el precio aplicado', () => {
  test('% sobre el precio del profesional; monto fijo no cambia', () => {
    const r = front.buildCitaServices([corte, barba], { professional: ana });
    const cita = { services: r.services, price: r.totalPrice };
    const c = calculateCommissionForCita(cita, ana, catalog);
    assert.equal(c.totalAmount, 60 + 10); // 40% de 150 + 10 Bs fijos
  });
});

describe('formatos', () => {
  test('textos de precio', () => {
    assert.equal(front.formatPriceRange(100), 'Bs 100');
    assert.equal(front.formatPriceRange(100, 150), 'Bs 100 – 150');
    assert.equal(front.formatPriceRange(100, 150, { variable: true }), 'Desde Bs 100');
    assert.equal(front.formatPriceRange(99.5, 99.5), 'Bs 99.50');
    assert.equal(formatAmountRange(100, 100), '100 Bs');
    assert.equal(formatAmountRange(100, 150), '100 – 150 Bs');
    assert.equal(formatAmountRange(100, 150, true), 'Desde Bs 100');
    assert.equal(formatServicePriceFor(corte, { professional: ana }), '150 Bs');
    assert.equal(formatServicePriceFor(corte, { professionals: [ana, beto] }), '100 – 150 Bs');
    assert.equal(formatServicePriceFor(color, { professional: ana }), 'Desde Bs 250');
    assert.equal(formatServicePrice(corte), '100 Bs', 'el formato anterior no cambia');
  });
});

describe('copia del backend idéntica a la del front', () => {
  test('mismas funciones exportadas', () => {
    assert.deepEqual(Object.keys(back).sort(), Object.keys(front).sort());
  });

  test('mismos resultados', () => {
    const casos = [
      (m) => m.resolveServicePrice(corte, ana),
      (m) => m.resolveServicePrice(promo, beto, { promoActive: true }),
      (m) => m.getServicePriceRange(corte, [ana, beto, inactiva]),
      (m) => m.buildCitaServices([corte, barba, color], { professional: ana }),
      (m) => m.buildCitaServices([corte, barba], { candidates: [ana, beto] }),
      (m) => m.repriceCitaServices(m.buildCitaServices([corte], { candidates: [ana, beto] }).services, catalog, beto),
      (m) => m.getMinimumPrice({ serviceId: 's3', price: 200 }, color, ana),
      (m) => m.formatPriceRange(100, 150),
      (m) => m.normalizeCustomPrice('12.345'),
    ];
    for (const caso of casos) assert.deepEqual(caso(back), caso(front));
  });

  test('el código es el mismo (salvo el encabezado de la copia)', async () => {
    const { readFile } = await import('node:fs/promises');
    const a = await readFile(new URL('../src/shared/servicePricing/professionalPricing.js', import.meta.url), 'utf8');
    const b = await readFile(new URL('../backend/services/pricing/professionalPricing.js', import.meta.url), 'utf8');
    assert.ok(b.endsWith(a), 'backend/services/pricing/professionalPricing.js debe ser copia de src/shared/servicePricing/professionalPricing.js');
  });
});
