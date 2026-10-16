// connectionModel.js
//
// Funciones puras (sin Firebase) para conectar el número de WhatsApp de un
// negocio. Los números por YCloud (coexistencia) se guardan en
// whatsappAccounts/ycloud_<digitos> = { provider: 'ycloud', negocioId, phone, branch? }.

export const COEXISTENCIA_DIAS = 14; // Meta: abrir la app de WhatsApp Business al menos cada 14 días
export const AVISO_DESDE_DIAS = 10;  // a partir de aquí se avisa al dueño

const soloDigitos = (v) => String(v || '').replace(/\D/g, '');

/**
 * Normaliza un número escrito por el dueño. Acepta "+591 71234567",
 * "71234567" (Bolivia por defecto), "0059171234567"...
 * Devuelve los dígitos con código de país, o null si no es válido.
 */
export function normalizarNumero(raw, codigoPais = '591') {
  let d = soloDigitos(raw);
  if (d.startsWith('00')) d = d.slice(2);
  if (!d) return null;
  // Número local boliviano de 8 dígitos (6xxxxxxx / 7xxxxxxx / 2-4xxxxxxx).
  if (d.length === 8 && codigoPais === '591') d = `591${d}`;
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

export const idCuentaYCloud = (digitos) => `ycloud_${digitos}`;

/** "+591 71234567" para mostrar. */
export function formatearNumero(digitos) {
  const d = soloDigitos(digitos);
  if (!d) return '';
  if (d.startsWith('591') && d.length === 11) return `+591 ${d.slice(3)}`;
  return `+${d}`;
}

const diasDesde = (iso, ahora) => {
  const t = Date.parse(iso || '');
  if (!t) return null;
  return Math.floor((ahora - t) / (24 * 60 * 60 * 1000));
};

/**
 * Estado de la coexistencia según la última vez que el dueño usó la app de
 * WhatsApp Business (YCloud avisa cada mensaje que el dueño envía desde la app).
 *   ok        -> usó la app hace menos de AVISO_DESDE_DIAS días
 *   aviso     -> entre AVISO_DESDE_DIAS y COEXISTENCIA_DIAS días
 *   vencido   -> COEXISTENCIA_DIAS días o más
 *   sin_datos -> todavía no hay registro (recién conectado)
 */
export function estadoCoexistencia(lastAppActivityAt, ahora = Date.now()) {
  const dias = diasDesde(lastAppActivityAt, ahora);
  if (dias === null) return { estado: 'sin_datos', dias: null, quedan: null };
  const quedan = Math.max(0, COEXISTENCIA_DIAS - dias);
  if (dias >= COEXISTENCIA_DIAS) return { estado: 'vencido', dias, quedan: 0 };
  if (dias >= AVISO_DESDE_DIAS) return { estado: 'aviso', dias, quedan };
  return { estado: 'ok', dias, quedan };
}

/** Lo que ve el admin del negocio: nunca tokens ni secretos. */
export function vistaPublica(id, data = {}, ahora = Date.now()) {
  const provider = data.provider || 'meta';
  const phone = data.phone || (provider === 'ycloud' ? `+${String(id).replace(/^ycloud_/, '')}` : null);
  const ultimaApp = data.lastAppActivityAt || data.connectedAt || null;
  return {
    id,
    provider,
    phone: phone ? formatearNumero(phone) : null,
    branch: data.branch || null,
    verifiedName: data.verifiedName || null,
    connectedAt: data.connectedAt || null,
    lastAppActivityAt: data.lastAppActivityAt || null,
    coexistencia: provider === 'ycloud' ? estadoCoexistencia(ultimaApp, ahora) : null,
    // Los números de Meta los configura soporte: el admin no los quita desde el panel.
    removable: provider === 'ycloud',
  };
}

/**
 * Busca un número dentro de la lista de YCloud. YCloud usa camelCase
 * (phoneNumber, wabaId, verifiedName); se acepta también snake_case.
 */
export function buscarEnYCloud(items = [], digitos) {
  for (const it of items || []) {
    const num = soloDigitos(it?.phoneNumber ?? it?.phone_number ?? it?.displayPhoneNumber ?? it?.display_phone_number);
    if (num && num === digitos) {
      return {
        wabaId: it.wabaId ?? it.waba_id ?? null,
        verifiedName: it.verifiedName ?? it.verified_name ?? null,
        status: it.status ?? null,
        qualityRating: it.qualityRating ?? it.quality_rating ?? null,
      };
    }
  }
  return null;
}

/** Nombre de sucursal válido para este negocio (o null = todas). */
export function sucursalValida(branch, sucursales = []) {
  const b = String(branch || '').trim();
  if (!b) return { ok: true, branch: null };
  const existe = (sucursales || []).some((s) => s?.name === b && s?.active !== false);
  return existe ? { ok: true, branch: b } : { ok: false };
}
