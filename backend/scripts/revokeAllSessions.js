// Cierra TODAS las sesiones activas de authSessions (status 'revoked'),
// menos las del Super Admin (excluido del límite de sesiones).
// Pensado para el cambio de dominio: todos tienen que volver a entrar igual.
//
// Por defecto NO escribe nada: solo muestra cuántas sesiones cerraría.
//
// Uso (desde la carpeta backend, con las variables FIREBASE_* configuradas):
//   node scripts/revokeAllSessions.js            -> simulación, solo lectura
//   node scripts/revokeAllSessions.js --apply    -> cierra las sesiones
// En Railway:  railway run node scripts/revokeAllSessions.js [--apply]

import 'dotenv/config';
import { getAuth } from 'firebase-admin/auth';
import { db } from '../config/firebase.js';
import { isExemptFromLimit } from '../services/session/sessionService.js';

const APPLY = process.argv.includes('--apply');
const REASON = 'domain-migration';

// uid -> email, consultando Firebase Auth de a 100 (máximo que permite getUsers).
async function emailsByUid(uids) {
  const map = new Map();
  for (let i = 0; i < uids.length; i += 100) {
    const r = await getAuth().getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of r.users) map.set(u.uid, u.email || null);
  }
  return map;
}

async function main() {
  const snap = await db.collection('authSessions').where('status', '==', 'active').get();
  const uids = [...new Set(snap.docs.map((d) => d.data().uid).filter(Boolean))];
  const emails = await emailsByUid(uids);

  const aCerrar = [];
  let excluidas = 0;
  for (const d of snap.docs) {
    if (isExemptFromLimit({ email: emails.get(d.data().uid) })) excluidas++;
    else aCerrar.push(d);
  }

  console.log(`Sesiones activas: ${snap.size}`);
  console.log(`Del Super Admin (se mantienen): ${excluidas}`);
  console.log(`A cerrar: ${aCerrar.length} (de ${new Set(aCerrar.map((d) => d.data().uid)).size} usuarios)`);

  if (!APPLY) {
    console.log('\nSimulación: no se cambió nada. Para cerrarlas, vuelve a correr con --apply.');
    return;
  }

  const endedAt = new Date().toISOString();
  for (let i = 0; i < aCerrar.length; i += 400) {
    const batch = db.batch();
    for (const d of aCerrar.slice(i, i + 400)) {
      batch.update(d.ref, { status: 'revoked', endedAt, endedReason: REASON });
    }
    await batch.commit();
  }
  console.log(`\nListo: ${aCerrar.length} sesiones cerradas (endedReason: '${REASON}').`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
