import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDioxAn9-8TbZsONAQV9XrTX4krbCBbED4",
  authDomain: "gally-flow.firebaseapp.com",
  projectId: "gally-flow",
  storageBucket: "gally-flow.firebasestorage.app",
  messagingSenderId: "1034377267475",
  appId: "1:1034377267475:web:ecb0f071d1bc630e0132e6"
};

// /barber usa su propia instancia de Firebase: así la sesión del profesional
// no reemplaza la del administrador si ambos usan el mismo navegador.
const isStaffRoute = typeof window !== 'undefined' && /^\/barber(\/|$)/.test(window.location.pathname);
const app = isStaffRoute ? initializeApp(firebaseConfig, 'staff') : initializeApp(firebaseConfig);
const secondaryApp = initializeApp(firebaseConfig, 'Secondary');

export const db = getFirestore(app);
export const auth = getAuth(app);
export const secondaryAuth = getAuth(secondaryApp);