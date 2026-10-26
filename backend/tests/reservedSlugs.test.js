// Slugs reservados y URL limpia del link público (/slug, /slug/p/proId).
// Ejecutar:  cd backend && npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESERVED_SLUGS, isReservedSlug } from '../utils/reservedSlugs.js';
import * as front from '../../src/shared/booking/publicRoutes.js';

test('la lista del backend y la del frontend coinciden', () => {
  assert.deepEqual([...RESERVED_SLUGS].sort(), [...front.RESERVED_SLUGS].sort());
});

test('las rutas de la app están reservadas', () => {
  for (const s of ['admin', 'barber', 'reservar', 'p', 'assets', 'brand', 'login', 'api', 'ADMIN']) {
    assert.equal(isReservedSlug(s), true, s);
  }
  assert.equal(isReservedSlug('barberiajuan'), false);
});

test('parsePublicBookingPath: URL limpia', () => {
  const parse = front.parsePublicBookingPath;
  assert.deepEqual(parse('/juanbarber'), { slug: 'juanbarber', proId: null });
  assert.deepEqual(parse('/juanbarber/'), { slug: 'juanbarber', proId: null });
  assert.deepEqual(parse('/JuanBarber/p/abc123'), { slug: 'juanbarber', proId: 'abc123' });
  // raíz, rutas de la app y formatos raros no son links públicos
  for (const p of ['/', '', '/admin', '/barber', '/reservar', '/p', '/juan/x', '/juan/p', '/juan/p/a/b', '/favicon.svg']) {
    assert.equal(parse(p), null, p);
  }
});

test('isAppRoute compara por segmento, no por prefijo', () => {
  assert.equal(front.isAppRoute('/barber', 'barber'), true);
  assert.equal(front.isAppRoute('/barber/x', 'barber'), true);
  assert.equal(front.isAppRoute('/barberiajuan', 'barber'), false);
  assert.equal(front.isAppRoute('/reservarya', 'reservar'), false);
});
