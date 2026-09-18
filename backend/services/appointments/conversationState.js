// conversationState.js
//
// CRUD del estado de conversación del Assistant Engine. Una conversación
// por (negocioId, phone) — mismo teléfono que escribe siempre retoma su
// conversación activa en vez de crear una nueva cada vez.

import { db } from '../../config/firebase.js';

const DEFAULT_STATE = {
  status: 'active',
  currentFlow: 'welcome',
  selectedService: null,
  selectedStaff: null,
  selectedDate: null,
  selectedTime: null,
};

function conversationsRef(negocioId) {
  return db.collection('negocios').doc(negocioId).collection('assistantConversations');
}

export async function getOrCreateConversation(negocioId, phone) {
  const ref = conversationsRef(negocioId).doc(phone);
  const snap = await ref.get();

  if (snap.exists) {
    return { id: snap.id, ...snap.data() };
  }

  const nueva = {
    ...DEFAULT_STATE,
    phone,
    negocioId,
    updatedAt: new Date().toISOString(),
  };
  await ref.set(nueva);
  return { id: phone, ...nueva };
}

export async function updateConversation(negocioId, phone, cambios) {
  const ref = conversationsRef(negocioId).doc(phone);
  const datos = { ...cambios, updatedAt: new Date().toISOString() };
  await ref.set(datos, { merge: true });
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() };
}

export async function resetConversation(negocioId, phone) {
  return updateConversation(negocioId, phone, { ...DEFAULT_STATE });
}