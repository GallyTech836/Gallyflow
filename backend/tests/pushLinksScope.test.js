// El enlace de cada notificación push debe quedar dentro del `scope` del
// manifest de su app instalada (PWA). Si queda fuera, el celular abre el
// navegador en vez de la app.
//
// Ejecutar:  cd backend && npm test

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeDb, FieldValue } from './helpers/fakeFirestore.js';

mock.module('../config/firebase.js', { namedExports: { db: createFakeDb() } });
mock.module('firebase-admin/firestore', { namedExports: { FieldValue } });

const { APP_URLS } = await import('../services/notificationService.js');

const scopeDe = (archivo) => JSON.parse(readFileSync(new URL(`../../public/${archivo}`, import.meta.url), 'utf8')).scope;

test('admin y barbero: el enlace de la notificación abre la app instalada', () => {
  for (const [rol, manifest] of [['admin', 'manifest-admin.json'], ['barber', 'manifest-barber.json']]) {
    const scope = scopeDe(manifest);
    const path = new URL(APP_URLS[rol]).pathname;
    assert.ok(path === scope || path.startsWith(`${scope}/`), `${rol}: ${path} fuera del scope ${scope}`);
  }
});
