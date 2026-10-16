// publicBookingApi.js
//
// Reserva online del cliente (ClienteApp) a través del backend. El navegador
// ya no lee las citas ni la base de clientes del negocio: solo recibe los
// horarios ocupados (sin nombres ni teléfonos) y envía la reserva para que
// el backend la valide y la guarde.

import { BASE_URL } from '../notifications/notificationApi';

/** Citas y bloqueos del día sin datos privados -> { citas, bloqueos } (null si falla). */
export async function fetchBusyAppointments(negocioId, date) {
  try {
    const params = new URLSearchParams({ negocioId, date });
    const res = await fetch(`${BASE_URL}/appointments/busy?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return {
      citas: Array.isArray(data.citas) ? data.citas : [],
      bloqueos: Array.isArray(data.bloqueos) ? data.bloqueos : [],
    };
  } catch (_) {
    return null;
  }
}

/**
 * Crea la reserva. -> { ok: true, cita } | { ok: false, error, code }
 * cita = { id, professionalId, serviceName, price, priceProvisional }
 */
export async function createPublicBooking(payload) {
  try {
    const res = await fetch(`${BASE_URL}/appointments/public`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || 'No se pudo guardar la reserva.', code: data.code || null, status: res.status };
    return { ok: true, cita: data.cita };
  } catch (_) {
    return { ok: false, error: 'Sin conexión. Revisa tu internet e inténtalo de nuevo.', code: 'NETWORK', status: 0 };
  }
}
