// Único archivo del frontend que habla con /api/finance/*. Todas las
// llamadas van con el ID token de Firebase del usuario logueado — el
// backend deriva el negocioId de ahí, nunca lo mandamos nosotros.

import { auth } from '../../firebase/config';

const BASE_URL = 'https://gallyflow-production.up.railway.app/api';

async function authHeaders(extra = {}) {
  const token = await auth.currentUser?.getIdToken();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extra };
}

export async function setFinancePin(pin) {
  const res = await fetch(`${BASE_URL}/finance/set-pin`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ pin }),
  });
  return res.json();
}

export async function verifyFinancePin(pin) {
  const res = await fetch(`${BASE_URL}/finance/verify-pin`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ pin }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, ...data };
}

export async function getFinanceSummary(sessionToken, { startDate, endDate, branch }) {
  const params = new URLSearchParams({ startDate, endDate, branch: branch || 'all' });
  const res = await fetch(`${BASE_URL}/finance/summary?${params}`, {
    headers: await authHeaders({ 'x-finance-session': sessionToken }),
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

export async function getFinanceCommissions(sessionToken, { startDate, endDate, branch }) {
  const params = new URLSearchParams({ startDate, endDate, branch: branch || 'all' });
  const res = await fetch(`${BASE_URL}/finance/commissions?${params}`, {
    headers: await authHeaders({ 'x-finance-session': sessionToken }),
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

export async function getFinanceCommissionDetail(sessionToken, barberId, { startDate, endDate }) {
  const params = new URLSearchParams({ startDate, endDate });
  const res = await fetch(`${BASE_URL}/finance/commissions/${barberId}?${params}`, {
    headers: await authHeaders({ 'x-finance-session': sessionToken }),
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

export async function payFinanceCommission(sessionToken, barberId, { startDate, endDate }) {
  const res = await fetch(`${BASE_URL}/finance/commissions/${barberId}/pay`, {
    method: 'POST',
    headers: await authHeaders({ 'x-finance-session': sessionToken }),
    body: JSON.stringify({ startDate, endDate }),
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}