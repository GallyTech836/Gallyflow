// Único punto donde se inicializa firebase-admin. Nadie más en el backend
// debe llamar a initializeApp(): todo lo demás importa `db` desde aquí.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function buildCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      '[firebase] Faltan variables de entorno (FIREBASE_PROJECT_ID, ' +
        'FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY). Revisa el .env.'
    );
  }

  return cert({
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  });
}

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ credential: buildCredential() });

export const db = getFirestore(app);