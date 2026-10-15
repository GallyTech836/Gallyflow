// Pruebas de la página pública «Más información del negocio» (funciones puras).
// Ejecutar (desde la raíz):  npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  visibleProfessionals,
  visibleServices,
  visibleBranches,
  businessDescription,
  scheduleRows,
  whatsappContacts,
  professionalBranchLabel,
} from '../src/client/businessInfoModel.js';
import { DEFAULT_HERO_CONFIG } from '../src/shared/heroConfig/heroConfigModel.js';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const ana = { id: 'ana', name: 'Ana', branch: 'Centro', services: [{ serviceId: 's1' }, { serviceId: 's2' }] };
const beto = { id: 'beto', name: 'Beto', branch: 'b2', services: ['s1'] };
const sinServicios = { id: 'x', name: 'Nuevo', services: [] };
const inactivo = { id: 'y', name: 'Inactivo', active: false, services: [{ serviceId: 's3' }] };
const pendiente = { id: 'pending', name: 'Pendiente', isPending: true, services: [] };
const services = [{ id: 's1', name: 'Corte' }, { id: 's2', name: 'Barba' }, { id: 's3', name: 'Color' }, { id: 's4', name: 'Nadie' }];
const branches = [
  { id: 'b1', name: 'Centro', phone: '70012345' },
  { id: 'b2', name: 'Norte', phone: '+591 700 12345' }, // mismo número que Centro
  { id: 'b3', name: 'Sur', phone: 'N/A' },
  { id: 'b4', name: 'Cerrada', phone: '71111111', active: false },
];

describe('profesionales y servicios visibles', () => {
  test('solo profesionales activos con servicios; nunca "Pendiente"', () => {
    const r = visibleProfessionals([ana, beto, sinServicios, inactivo, pendiente]);
    assert.deepEqual(r.map((p) => p.id), ['ana', 'beto']);
  });

  test('link personal: solo ese profesional', () => {
    assert.deepEqual(visibleProfessionals([ana, beto], { personalPro: beto }).map((p) => p.id), ['beto']);
  });

  test('servicios que alguien realiza (no los de inactivos ni sin profesional)', () => {
    const pros = visibleProfessionals([ana, beto, inactivo]);
    assert.deepEqual(visibleServices(services, pros).map((s) => s.id), ['s1', 's2']);
    assert.deepEqual(visibleServices(services, [beto]).map((s) => s.id), ['s1']);
  });

  test('negocio sin profesionales configurados: muestra todos los servicios', () => {
    assert.equal(visibleServices(services, []).length, 4);
    assert.equal(visibleServices(services, [sinServicios]).length, 4);
  });
});

describe('presentación', () => {
  test('descripción: el eslogan propio, nunca el texto por defecto', () => {
    assert.equal(businessDescription({ slogan: 'Cortes clásicos' }), 'Cortes clásicos');
    assert.equal(businessDescription({ slogan: DEFAULT_HERO_CONFIG.slogan }), '');
    assert.equal(businessDescription({}), '');
  });
});

describe('horario', () => {
  test('sin configurar (00:00–23:59 todos los días) => no se muestra', () => {
    assert.deepEqual(scheduleRows(DIAS.map((day) => ({ day, status: 'Disponible', start: '00:00', end: '23:59' }))), []);
    assert.deepEqual(scheduleRows(undefined), []);
  });

  test('agrupa días seguidos iguales', () => {
    const s = DIAS.map((day, i) => (i < 5 ? { day, status: 'Disponible', start: '09:00', end: '19:00' }
      : i === 5 ? { day, status: 'Disponible', start: '09:00', end: '14:00' } : { day, status: 'Cerrado' }));
    assert.deepEqual(scheduleRows(s), [
      { days: 'Lun a Vie', hours: '09:00 – 19:00' },
      { days: 'Sáb', hours: '09:00 – 14:00' },
      { days: 'Dom', hours: 'Cerrado' },
    ]);
  });
});

describe('sucursales y WhatsApp', () => {
  test('sucursales activas; en link personal, la del profesional', () => {
    assert.deepEqual(visibleBranches(branches).map((b) => b.id), ['b1', 'b2', 'b3']);
    assert.deepEqual(visibleBranches(branches, { personalPro: beto }).map((b) => b.id), ['b2']);
    assert.deepEqual(visibleBranches(branches, { personalPro: { branch: 'NoExiste' } }).length, 3);
  });

  test('WhatsApp solo con números válidos y sin repetir', () => {
    const r = whatsappContacts(visibleBranches(branches));
    assert.deepEqual(r.map((c) => c.branchId), ['b1']);
    assert.deepEqual(whatsappContacts([{ id: 'z', phone: '' }, { id: 'w' }]), []);
  });

  test('sucursal del profesional solo si hay varias', () => {
    assert.equal(professionalBranchLabel(beto, visibleBranches(branches)), 'Norte');
    assert.equal(professionalBranchLabel(ana, [branches[0]]), '');
  });
});
