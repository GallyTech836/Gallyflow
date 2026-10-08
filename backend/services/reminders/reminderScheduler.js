// reminderScheduler.js
//
// Recordatorio push al PROFESIONAL asignado antes de su cita.
//
// Un solo listener (onSnapshot) sobre las citas de hoy y mañana de todos los
// negocios: Firestore cobra la carga inicial y los cambios, no cada revisión.
// Cada 30 s se revisa en memoria qué recordatorios tocan.
//
// Sin duplicados: antes de enviar se "reclama" el recordatorio en una
// transacción (campo remindersSent en la cita). Si la cita cambia de hora,
// la marca cambia y se vuelve a recordar.

import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';
import { sendNotification } from '../notificationService.js';
import { checkCapability } from '../capabilities/capabilityService.js';

const TZ = process.env.APP_TIMEZONE || 'America/La_Paz';
// "30" = un recordatorio 30 min antes. "60,30" = doble recordatorio.
const REMINDER_MINUTES = (process.env.REMINDER_MINUTES || '30')
  .split(',').map((n) => Number(n.trim())).filter((n) => n > 0).sort((a, b) => b - a);
const GRACE_MS = 5 * 60 * 1000;
const TICK_MS = 30 * 1000;
const REMIND_STATUSES = new Set(['confirmed', 'pending']);

const citas = new Map();
let unsubscribe = null;
let activeKey = '';
let running = false;

function dateInTz(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86400000));
}

function zonedToEpoch(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(guess));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return guess - (asUtc - guess);
}

function subscribe() {
  const dates = [dateInTz(0), dateInTz(1)];
  const key = dates.join('|');
  if (key === activeKey) return;
  if (unsubscribe) unsubscribe();
  citas.clear();
  activeKey = key;
  unsubscribe = db.collectionGroup('citas').where('date', 'in', dates).onSnapshot(
    (snap) => {
      snap.docChanges().forEach((ch) => {
        const path = ch.doc.ref.path;
        if (ch.type === 'removed') citas.delete(path);
        else citas.set(path, { ref: ch.doc.ref, data: ch.doc.data() });
      });
    },
    (err) => {
      logger.error('[reminders] Error del listener (¿falta el índice de grupo de colección en `date`?):', err.message);
      activeKey = '';
    }
  );
  logger.info(`[reminders] Escuchando citas de ${dates.join(' y ')} (zona ${TZ}, recordatorios: ${REMINDER_MINUTES.join(',')} min)`);
}

async function claimAndSend(ref, minutes, mark) {
  const negocioId = ref.parent.parent.id;

  // Capacidad `recordatoriosPush` (caché de 60 s, no agrega lecturas por tick).
  try {
    const permiso = await checkCapability(negocioId, 'recordatoriosPush', { checkLimit: false });
    if (!permiso.allowed) return;
  } catch (err) {
    logger.warn('[reminders] No se pudo validar recordatoriosPush:', err.message);
    return;
  }

  const fresh = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data();
    const proId = d.professionalId || d.barberId;
    if (!REMIND_STATUSES.has(d.status) || !proId || proId === 'pending') return null;
    if (`${d.date} ${d.time}|${minutes}` !== mark) return null;
    if ((d.remindersSent || []).includes(mark)) return null;
    tx.update(ref, { remindersSent: FieldValue.arrayUnion(mark) });
    return { ...d, proId };
  });
  if (!fresh) return;

  try {
    await sendNotification({
      tipo: 'RECORDATORIO_CITA',
      negocioId,
      data: { clientName: fresh.clientName, time: fresh.time, serviceName: fresh.serviceName, minutes },
      targetProfessionalId: fresh.proId,
      onlyTargetProfessional: true,
    });
  } catch (err) {
    logger.warn('[reminders] Falló el envío:', err.message);
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    subscribe();
    const now = Date.now();
    for (const { ref, data } of [...citas.values()]) {
      const proId = data.professionalId || data.barberId;
      if (!REMIND_STATUSES.has(data.status) || !proId || proId === 'pending') continue;
      if (!data.date || !data.time) continue;
      const start = zonedToEpoch(data.date, data.time);
      if (Date.now() >= start) continue;
      for (const minutes of REMINDER_MINUTES) {
        const at = start - minutes * 60000;
        if (now < at || now > at + GRACE_MS) continue;
        const mark = `${data.date} ${data.time}|${minutes}`;
        if ((data.remindersSent || []).includes(mark)) continue;
        await claimAndSend(ref, minutes, mark);
      }
    }
  } catch (err) {
    logger.warn('[reminders] tick falló:', err.message);
  } finally {
    running = false;
  }
}

export function startReminderScheduler() {
  if (process.env.REMINDERS_ENABLED === 'false') {
    logger.info('[reminders] Desactivado (REMINDERS_ENABLED=false)');
    return;
  }
  tick();
  setInterval(tick, TICK_MS);
}
