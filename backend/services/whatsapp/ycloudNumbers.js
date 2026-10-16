// ycloudNumbers.js
//
// Consulta los números de WhatsApp conectados en TU cuenta de YCloud
// (YCLOUD_API_KEY). Sirve para no aceptar un número que todavía no se
// conectó (el dueño no puede conectarlo solo: lo haces tú desde YCloud).

import { buscarEnYCloud } from './connectionModel.js';

const URL_NUMEROS = 'https://api.ycloud.com/v2/whatsapp/phoneNumbers';
const MAX_PAGINAS = 5;
const POR_PAGINA = 100;

/**
 * Devuelve { encontrado: {wabaId, verifiedName, status, qualityRating} | null }
 * o lanza Error con code 'YCLOUD_NO_CONFIG' / 'YCLOUD_ERROR'.
 */
export async function buscarNumeroEnYCloud(digitos, { fetchImpl = fetch, apiKey = process.env.YCLOUD_API_KEY } = {}) {
  if (!apiKey) {
    const e = new Error('Falta YCLOUD_API_KEY en el servidor.');
    e.code = 'YCLOUD_NO_CONFIG';
    throw e;
  }
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const res = await fetchImpl(`${URL_NUMEROS}?page=${page}&limit=${POR_PAGINA}`, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(`YCloud respondió ${res.status}`);
      e.code = 'YCLOUD_ERROR';
      throw e;
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    const encontrado = buscarEnYCloud(items, digitos);
    if (encontrado) return { encontrado };
    if (items.length < POR_PAGINA) break;
  }
  return { encontrado: null };
}
