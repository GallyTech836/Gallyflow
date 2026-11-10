// Pruebas del formulario público de registro (POST /api/registro) y de las
// solicitudes en Super Admin (listar, descartar y crear el negocio completo).
// Ejecutar:  cd backend && npm test

import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';
import { createFakeRouter, runRoute } from './helpers/fakeExpress.js';

const db = createFakeDb();
const router = createFakeRouter();
const pasa = (req, res, next) => next();

// Firebase Auth de mentira: guarda usuarios por correo.
const authUsers = new Map();
let authN = 0;
const fakeAuth = {
  createUser: async ({ email }) => {
    if ([...authUsers.values()].includes(email)) { const e = new Error('existe'); e.code = 'auth/email-already-exists'; throw e; }
    const uid = `uid${++authN}`; authUsers.set(uid, email); return { uid };
  },
  deleteUser: async (uid) => { authUsers.delete(uid); },
  getUserByEmail: async () => ({ uid: 'x' }),
  updateUser: async () => {},
};

mock.module('../config/firebase.js', { namedExports: { db } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });
mock.module('firebase-admin/auth', { namedExports: { getAuth: () => fakeAuth } });
mock.module('express', { namedExports: { Router: () => router } });
mock.module('../middlewares/auth.middleware.js', { namedExports: { identifyRequester: pasa } });
mock.module('../middlewares/session.middleware.js', { namedExports: { requireSession: pasa } });
mock.module('../middlewares/rateLimit.middleware.js', { namedExports: { registroRateLimit: pasa, staffAdminRateLimit: pasa } });

await import('../routes/registro.routes.js');
await import('../routes/superadmin.routes.js');
const { sanitizeRegistro, DEFAULT_STAFF_PERMISSIONS, baseUsername, pickPin } = await import('../services/registro/registroModel.js');
const { DEFAULT_HERO_CONFIG } = await import('../services/negocios/createNegocio.js');
// staffPermissionsModel.js importa sin extensión (Vite): se lee el objeto del archivo.
const frontPerms = (() => {
  const src = readFileSync(new URL('../../src/shared/staffPermissions/staffPermissionsModel.js', import.meta.url), 'utf8');
  const literal = src.match(/DEFAULT_STAFF_PERMISSIONS = (\{[\s\S]*?\n\s*\});/)[1].replace(/\/\/.*$/gm, '');
  return Function(`return (${literal});`)();
})();
const frontHero = await import('../../src/shared/heroConfig/heroConfigModel.js');

const SUPER = { verified: true, email: 'torricogali@gmail.com' };
const CLOUD = 'https://res.cloudinary.com/yr91yhlf/image/upload/v1/logo.jpg';
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const llamar = (method, path, body = {}, actor = SUPER) => runRoute(router, method, path, { body, actor, headers: { 'user-agent': 'test' } });

// Lo mismo que arma public/registro.html (payload()).
function payload(over = {}) {
  return {
    negocio: { name: 'Barbería Los Pinos', businessType: 'barberia', ownerName: 'Jorge Pinto', phone: '76543210', country: 'Bolivia', city: 'Santa Cruz de la Sierra', ownerEmail: 'jorge@pinos.com' },
    heroConfig: { businessName: 'Barbería Los Pinos', slogan: 'Tu estilo', logo: CLOUD, cover: 'blob:null/abc' },
    businessSettings: {
      schedule: DIAS.map((day, i) => ({ day, status: i < 6 ? 'Disponible' : 'Cerrado', start: '09:00', end: '19:00' })),
      minAdvanceMinutes: 30, paymentMethods: ['Efectivo', 'QR'],
    },
    sucursales: [
      { tempId: 'b1', name: 'Central', image: '', phone: '+591 71234567', schedule: 'Lunes a Sábado, 09:00 - 19:00', mapsUrl: 'https://maps.app.goo.gl/x', address: 'Av. Piraí 300' },
      { tempId: 'b2', name: 'Norte', image: '', phone: '', schedule: '', mapsUrl: '', address: 'Calle 2' },
    ],
    servicios: [
      { tempId: 't1', name: 'Corte clásico', image: '', price: 40, duration: 30, priceVariable: false, featured: true, availableDays: DIAS, category: 'Tratamiento', promoPrice: null },
      { tempId: 't2', name: 'Diseño de barba', image: CLOUD, price: 60, duration: 45, priceVariable: true, featured: false, availableDays: DIAS.slice(0, 6), category: 'Tratamiento', promoPrice: null },
    ],
    profesionales: [
      {
        tempId: 'p1', firstName: 'Sofía', lastName: 'Méndez', avatar: '', branch: 'Central', active: true,
        services: [{ serviceId: 't1', customPrice: 45, commissionEnabled: true, type: '%', value: 50 }, { serviceId: 't2', customPrice: null, commissionEnabled: false, type: '%', value: 40 }],
        availability: DIAS.map((day, i) => ({ day, status: i === 6 ? 'Descanso' : 'Disponible', start: '09:00', end: '19:00' })),
      },
      {
        tempId: 'p2', firstName: 'Diego', lastName: 'Rojas', avatar: CLOUD, branch: 'Norte', active: true,
        services: [{ serviceId: 't2', customPrice: '', commissionEnabled: false, type: '%', value: 40 }],
        availability: DIAS.map((day) => ({ day, status: 'Disponible', start: '10:00', end: '18:00' })),
      },
    ],
    ...over,
  };
}

const enviar = (data = payload(), website = '') => llamar('POST', '/registro', { website, data }, null);

beforeEach(() => {
  db._clear();
  authUsers.clear();
  db._set('planes/esencial', { name: 'Nexus Esencial', price: 200, active: true });
});

describe('copias del frontend', () => {
  test('permisos por defecto del profesional = staffPermissionsModel.js', () => {
    assert.deepEqual(DEFAULT_STAFF_PERMISSIONS, frontPerms);
  });
  test('heroConfig base = heroConfigModel.js (sin showServiceImages)', () => {
    const { showServiceImages, ...base } = frontHero.DEFAULT_HERO_CONFIG;
    assert.deepEqual(DEFAULT_HERO_CONFIG, base);
  });
});

describe('modelo', () => {
  test('un registro completo pasa la validación', () => {
    const { errors, data } = sanitizeRegistro(payload());
    assert.deepEqual(errors, []);
    assert.equal(data.heroConfig.cover, '', 'solo URLs de Cloudinary');
    assert.equal(data.heroConfig.logo, CLOUD);
    assert.equal(data.profesionales[1].services[0].customPrice, null);
  });
  test('rechaza datos incompletos o inconsistentes', () => {
    const p = payload();
    p.negocio.ownerEmail = 'mal';
    p.servicios[0].duration = 33;
    p.profesionales[0].branch = 'No existe';
    p.profesionales[1].services = [];
    const { errors } = sanitizeRegistro(p);
    assert.ok(errors.some((e) => /Correo/.test(e)));
    assert.ok(errors.some((e) => /duración/.test(e)));
    assert.ok(errors.some((e) => /sucursal no existe/.test(e)));
    assert.ok(errors.some((e) => /al menos un servicio/.test(e)));
  });
  test('usuario como AdminApp pero sin perder letras con tilde', () => {
    assert.equal(baseUsername('Sofía', 'Méndez'), 'sofia.mendez');
    assert.equal(baseUsername('Ana', ''), 'ana');
  });
  test('PIN de 4 dígitos sin repetir', () => {
    const used = new Set(['1000']);
    let i = 0; const seq = [0, 0, 0.5];
    const pin = pickPin(used, () => seq[i++] ?? 0.9);
    assert.match(pin, /^\d{4}$/);
    assert.notEqual(pin, '1000');
  });
});

describe('POST /api/registro', () => {
  test('guarda una solicitud pendiente y no crea nada más', async () => {
    const r = await enviar();
    assert.equal(r.status, 201);
    const sol = db._get(`solicitudesRegistro/${r.body.id}`);
    assert.equal(sol.status, 'pendiente');
    assert.equal(sol.negocioId, null);
    assert.equal(sol.data.negocio.name, 'Barbería Los Pinos');
    assert.equal(sol.origin.userAgent, 'test');
    assert.equal(db._list('negocios').length, 0);
    assert.equal(authUsers.size, 0);
  });
  test('campo trampa: responde ok y no guarda', async () => {
    const r = await enviar(payload(), 'http://spam');
    assert.equal(r.status, 200);
    assert.equal(db._list('solicitudesRegistro').length, 0);
  });
  test('datos inválidos: 400 con el primer error', async () => {
    const r = await enviar(payload({ servicios: [] }));
    assert.equal(r.status, 400);
    assert.match(r.body.error, /servicio/);
    assert.equal(db._list('solicitudesRegistro').length, 0);
  });
});

describe('Super Admin · solicitudes', () => {
  test('lista por estado y descarta / vuelve a pendiente', async () => {
    const { body: { id } } = await enviar();
    let r = await llamar('GET', '/solicitudes', {});
    assert.equal(r.body.solicitudes.length, 1);
    assert.equal(r.body.solicitudes[0].origin, undefined, 'no expone el origen');
    r = await llamar('PATCH', `/solicitudes/${id}`, { status: 'descartada', note: 'prueba' });
    assert.equal(r.status, 200);
    assert.equal(db._get(`solicitudesRegistro/${id}`).status, 'descartada');
    r = await runRoute(router, 'GET', '/solicitudes', { query: { status: 'descartada' }, actor: SUPER });
    assert.equal(r.body.solicitudes.length, 1);
    r = await llamar('PATCH', `/solicitudes/${id}`, { status: 'creada' });
    assert.equal(r.status, 400);
  });

  test('solo el Super Admin', async () => {
    const r = await llamar('GET', '/solicitudes', {}, { verified: true, email: 'otro@x.com' });
    assert.equal(r.status, 403);
  });

  test('crear: deja los documentos igual que la carga a mano', async () => {
    const { body: { id } } = await enviar();
    const r = await llamar('POST', `/solicitudes/${id}/crear`, { planId: 'esencial', trialDays: 14 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.id, 'jorge');
    assert.equal(r.body.email, 'jorge@pinos.com');
    assert.ok(r.body.tempPassword.length >= 6);
    assert.deepEqual(r.body.creados, { sucursales: 2, servicios: 2, profesionales: 2 });

    const neg = db._get('negocios/jorge');
    assert.equal(neg.status, 'trial');
    assert.equal(neg.plan, 'esencial');
    assert.equal(neg.trialDays, 14);
    assert.equal(neg.businessType, 'barberia');
    assert.equal(neg.ownerName, 'Jorge Pinto');
    assert.equal(neg.phone, '76543210');
    assert.equal(neg.heroConfig.businessName, 'Barbería Los Pinos');
    assert.equal(neg.heroConfig.slogan, 'Tu estilo');
    assert.equal(neg.heroConfig.logo, CLOUD);
    assert.equal(neg.heroConfig.showServiceImages, true);
    assert.deepEqual(Object.keys(neg.businessSettings).sort(), ['closedDays', 'minAdvanceMinutes', 'paymentMethods', 'schedule']);
    assert.equal(neg.businessSettings.schedule[6].status, 'Cerrado');
    assert.equal(neg.businessSettings.minAdvanceMinutes, 30);

    const sucs = db._list('negocios/jorge/sucursales');
    assert.deepEqual(Object.keys(sucs[0]).filter((k) => k !== 'id').sort(),
      ['active', 'address', 'createdAt', 'image', 'lat', 'lng', 'mapsUrl', 'name', 'phone', 'schedule']);

    const svc = db._get('negocios/jorge/servicios/s1');
    assert.deepEqual(Object.keys(svc).sort(),
      ['availableDays', 'category', 'createdAt', 'duration', 'featured', 'image', 'name', 'price', 'priceVariable', 'promoPrice']);
    assert.equal(svc.category, 'Tratamiento');
    assert.equal(db._get('negocios/jorge/servicios/s2').priceVariable, true);
    assert.ok(db._get('negocios/jorge/servicios/s2').createdAt > svc.createdAt, 'respeta el orden');

    const pros = db._list('negocios/jorge/profesionales');
    const sofia = pros.find((p) => p.firstName === 'Sofía');
    assert.equal(sofia.name, 'Sofía Méndez');
    assert.equal(sofia.username, 'sofia.mendez');
    assert.match(sofia.pin, /^\d{4}$/);
    assert.equal(sofia.branch, 'Central');
    assert.deepEqual(sofia.services, [
      { serviceId: 's1', commissionEnabled: true, type: '%', value: 50, customPrice: 45 },
      { serviceId: 's2', commissionEnabled: false, type: '%', value: 40 },
    ]);
    assert.deepEqual(sofia.permissions, DEFAULT_STAFF_PERMISSIONS);
    assert.equal(sofia.availability[6].status, 'Descanso');
    assert.equal(sofia.passwordHash, undefined, 'sin contraseña');
    assert.deepEqual(db._get(`usuarios/${sofia.id}`), { username: 'sofia.mendez', rol: 'barber', negocioId: 'jorge', uidFirebase: sofia.id });
    const diego = pros.find((p) => p.firstName === 'Diego');
    assert.notEqual(diego.pin, sofia.pin);

    const sol = db._get(`solicitudesRegistro/${id}`);
    assert.equal(sol.status, 'creada');
    assert.equal(sol.negocioId, 'jorge');

    const otra = await llamar('POST', `/solicitudes/${id}/crear`, { planId: 'esencial' });
    assert.equal(otra.status, 409);
  });

  test('usuario ya tomado en otro negocio: propone otro, como AdminApp', async () => {
    db._set('usuarios/zz', { username: 'sofia.mendez', rol: 'barber', negocioId: 'otro' });
    const { body: { id } } = await enviar();
    await llamar('POST', `/solicitudes/${id}/crear`, { planId: 'esencial' });
    const sofia = db._list('negocios/jorge/profesionales').find((p) => p.firstName === 'Sofía');
    assert.equal(sofia.username, 'sofia.mendez2');
  });

  test('correo ya usado: 409 y no crea nada', async () => {
    db._set('negocios/jorge', { email: 'jorge@pinos.com' });
    const { body: { id } } = await enviar();
    const r = await llamar('POST', `/solicitudes/${id}/crear`, { planId: 'esencial' });
    assert.equal(r.status, 409);
    assert.equal(authUsers.size, 0);
    assert.equal(db._list('negocios/jorge/servicios').length, 0);
    assert.equal(db._get(`solicitudesRegistro/${id}`).status, 'pendiente');
  });

  test('plan sin prueba (trialDays 0): se crea activo', async () => {
    db._set('planes/profesional', { name: 'Nexus Profesional', price: 350, trialDays: 0 });
    const { body: { id } } = await enviar();
    const r = await llamar('POST', `/solicitudes/${id}/crear`, { planId: 'profesional', trialDays: 14 });
    assert.equal(r.status, 201);
    const neg = db._get('negocios/jorge');
    assert.equal(neg.status, 'active');
    assert.equal(neg.trialEnd, undefined);
  });

  test('plan inexistente: 400', async () => {
    const { body: { id } } = await enviar();
    const r = await llamar('POST', `/solicitudes/${id}/crear`, { planId: 'nope' });
    assert.equal(r.status, 400);
    assert.equal(authUsers.size, 0);
  });

  test('falla a mitad de camino: deshace todo', async () => {
    const { body: { id } } = await enviar();
    const original = db.collection;
    db.collection = (name) => {
      if (name === 'usuarios') return { where: () => ({ limit: () => ({ get: async () => { throw new Error('boom'); } }) }) };
      return original(name);
    };
    try {
      const r = await llamar('POST', `/solicitudes/${id}/crear`, { planId: 'esencial' });
      assert.equal(r.status, 500);
    } finally {
      db.collection = original;
    }
    assert.equal(db._get('negocios/jorge'), undefined);
    assert.equal(db._list('negocios/jorge/sucursales').length, 0);
    assert.equal(db._list('negocios/jorge/servicios').length, 0);
    assert.equal(authUsers.size, 0);
    assert.equal(db._get(`solicitudesRegistro/${id}`).status, 'pendiente');
  });

  test('POST /negocios (Super Admin) sigue igual', async () => {
    const r = await llamar('POST', '/negocios', { name: 'Manual', ownerEmail: 'manual@x.com', plan: 'esencial', status: 'trial', trialDays: 14 });
    assert.equal(r.status, 201);
    assert.equal(r.body.id, 'manual');
    assert.equal(db._get('negocios/manual').heroConfig.businessName, 'Manual');
    const dup = await llamar('POST', '/negocios', { name: 'Manual', ownerEmail: 'manual@x.com' });
    assert.equal(dup.status, 409);
    const res = await llamar('POST', '/negocios', { ownerEmail: 'registro@x.com' });
    assert.equal(res.status, 400);
  });
});
