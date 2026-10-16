// staffCredentials.js
//
// Credenciales de profesionales (login con usuario + contraseña, sin correo).
// - El hash vive en staffCredentials/{uid}: solo lo lee el backend (las
//   reglas de Firestore ya la cierran con la regla final "deny").
// - Migración perezosa: si un profesional todavía no tiene hash, se compara
//   con la contraseña antigua de usuarios/{uid}.password y, si coincide, se
//   guarda el hash y se BORRA el texto plano. Si ya tenía hash y aún queda el
//   texto plano, también se borra al entrar.

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../config/firebase.js';
import { logger } from '../../utils/logger.js';

const credRef = (uid) => db.collection('staffCredentials').doc(uid);

function mismoTexto(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function setStaffPassword(uid, password, source = 'admin') {
  const passwordHash = await bcrypt.hash(password, 10);
  await credRef(uid).set({ passwordHash, source, updatedAt: new Date().toISOString() });
}

// Devuelve { uid, data } del profesional (sin contraseña) o null.
export async function verifyStaffLogin(username, password) {
  const snap = await db.collection('usuarios')
    .where('username', '==', username)
    .where('rol', '==', 'barber')
    .limit(5)
    .get();

  const coincidencias = [];
  for (const d of snap.docs) {
    const cred = await credRef(d.id).get();
    const hash = cred.exists ? cred.data().passwordHash : null;
    const antigua = d.data().password;
    if (hash) {
      if (await bcrypt.compare(password, hash)) coincidencias.push({ doc: d, legacy: false });
    } else if (typeof antigua === 'string' && antigua !== '' && mismoTexto(password, antigua)) {
      coincidencias.push({ doc: d, legacy: true });
    }
  }

  if (coincidencias.length !== 1) {
    if (coincidencias.length > 1) logger.warn('[staff] Login ambiguo: varias cuentas coinciden con el mismo usuario.');
    return null;
  }

  const { doc, legacy } = coincidencias[0];
  if (legacy) {
    await setStaffPassword(doc.id, password, 'legacy-login');
    logger.info('[staff] Credencial migrada a hash en el primer login.');
  }
  // El hash ya existe: la contraseña en texto plano sobra.
  if (Object.prototype.hasOwnProperty.call(doc.data(), 'password')) {
    await doc.ref.update({ password: FieldValue.delete() })
      .catch((err) => logger.warn('[staff] No se pudo borrar la contraseña antigua:', err.message));
  }
  const { password: _omitida, ...data } = doc.data();
  return { uid: doc.id, data };
}

// Usuario de Firebase Auth SIN correo (uid = id del profesional) + token.
// El sid (sesión del servidor) va en el token para usarlo luego en las reglas.
export async function issueStaffToken(uid, negocioId, sid) {
  const auth = getAuth();
  let user;
  try {
    user = await auth.getUser(uid);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    user = await auth.createUser({ uid });
  }
  const claims = { rol: 'barber', negocioId };
  const actuales = user.customClaims || {};
  if (actuales.rol !== 'barber' || actuales.negocioId !== negocioId) {
    await auth.setCustomUserClaims(uid, claims);
  }
  return auth.createCustomToken(uid, { ...claims, sid });
}

export async function isUsernameAvailable(username, excludeUid) {
  const snap = await db.collection('usuarios').where('username', '==', username).limit(3).get();
  return snap.docs.every((d) => d.id === excludeUid);
}

export async function suggestUsername(base, excludeUid) {
  if (await isUsernameAvailable(base, excludeUid)) return base;
  for (let i = 2; i < 50; i++) {
    if (await isUsernameAvailable(base + i, excludeUid)) return base + i;
  }
  return base + Date.now().toString().slice(-4);
}
