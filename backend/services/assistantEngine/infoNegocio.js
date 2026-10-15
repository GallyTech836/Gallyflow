// infoNegocio.js
//
// Funciones puras (sin Firebase) para responder a clientes que llegan desde
// un anuncio de Facebook/Instagram ("Click to WhatsApp") y para los botones
// «Servicios y precios» y «Ubicación y horarios» del asistente.

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_CORTOS = { Lunes: 'Lun', Martes: 'Mar', Miércoles: 'Mié', Jueves: 'Jue', Viernes: 'Vie', Sábado: 'Sáb', Domingo: 'Dom' };

// Textos típicos que Meta pre-carga en los anuncios o que la gente escribe.
const TEXTO_ANUNCIO = /m[aá]s\s+info|quiero\s+(saber|info|conocer)|me\s+interesa|info(rmaci[oó]n)?\s+(sobre|de|del|por\s+favor)|vi\s+(su|tu|el)\s+(anuncio|publicaci)|desde\s+(el\s+)?anuncio|^info(rmaci[oó]n)?[\s!.?]*$/i;

/**
 * ¿El mensaje viene de un anuncio?
 *  - `referral` (Meta / YCloud) con source_type 'ad' o 'post': seguro.
 *  - Sin referral: solo por el texto típico ("Quiero más información").
 */
export function esMensajeDeAnuncio(texto, referral = null) {
  if (referral && typeof referral === 'object') {
    const tipo = String(referral.source_type || referral.sourceType || '').toLowerCase();
    if (tipo === 'ad' || tipo === 'post' || referral.ctwa_clid || referral.ctwaClid) return true;
  }
  return TEXTO_ANUNCIO.test(String(texto || '').trim());
}

/** ¿Pregunta por precios / servicios? */
export function pideServicios(texto) {
  return /^info_servicios$|precio|servicio|cu[aá]nto\s+(cuesta|sale|cobran|vale)|costo|tarifa|cat[aá]logo|lista/i.test(String(texto || ''));
}

/** ¿Pregunta por ubicación / horarios? */
export function pideUbicacion(texto) {
  return /^info_ubicacion$|ubicaci|direcci|d[oó]nde\s+(est[aá]n|quedan|es)|c[oó]mo\s+llego|mapa|horario|a\s+qu[eé]\s+hora|abren|cierran|atienden/i.test(String(texto || ''));
}

// Mismo criterio que src/shared/location/mapsLink.js (copia intencional).
const DEFAULT_LAT = -17.7732;
const DEFAULT_LNG = -63.1821;
export function linkComoLlegar(branch) {
  if (!branch) return null;
  const customMatch = String(branch.mapsUrl || '').match(/https?:\/\/\S+/);
  const custom = customMatch ? customMatch[0] : '';
  if (/^https?:\/\/(([a-z0-9-]+\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/|share\.google\/)/i.test(custom)) {
    return custom;
  }
  const lat = Number(branch.lat);
  const lng = Number(branch.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && branch.lat !== null && branch.lat !== '' && branch.lng !== null && branch.lng !== '';
  const isDefaultPin = hasCoords && lat === DEFAULT_LAT && lng === DEFAULT_LNG;
  const address = String(branch.address || '').trim();
  let destino = null;
  if (hasCoords && !isDefaultPin) destino = `${lat},${lng}`;
  else if (address) destino = [branch.name, address].filter(Boolean).join(', ');
  if (!destino) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destino)}`;
}

function textoDia(d) {
  if (!d || d.status !== 'Disponible') return 'cerrado';
  return `${d.start || '00:00'} – ${d.end || '23:59'}`;
}

/**
 * Horario del negocio (businessSettings.schedule) agrupando días seguidos
 * iguales: "Lun a Vie: 09:00 – 19:00 · Sáb: 09:00 – 14:00 · Dom: cerrado".
 * null si no está configurado (todo 00:00–23:59, el valor por defecto).
 */
export function resumenHorario(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0) return null;
  const porDia = DIAS.map((day) => schedule.find((d) => d?.day === day) || null);
  const sinConfigurar = porDia.every((d) => !d || (d.status === 'Disponible' && (d.start || '00:00') === '00:00' && (d.end || '23:59') === '23:59'));
  if (sinConfigurar) return null;

  const grupos = [];
  porDia.forEach((d, i) => {
    const valor = d ? textoDia(d) : null;
    if (valor === null) return;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.valor === valor && ultimo.hasta === i - 1) ultimo.hasta = i;
    else grupos.push({ desde: i, hasta: i, valor });
  });
  return grupos.map((g) => {
    const dias = g.desde === g.hasta
      ? DIAS_CORTOS[DIAS[g.desde]]
      : `${DIAS_CORTOS[DIAS[g.desde]]} a ${DIAS_CORTOS[DIAS[g.hasta]]}`;
    return `${dias}: ${g.valor}`;
  }).join('\n');
}

/**
 * Texto de «Ubicación y horarios». Si el chat es de una sucursal concreta
 * (branch), solo esa. Devuelve null si no hay nada que mostrar.
 */
export function textoUbicacion({ sucursales = [], businessSettings = {}, branch = null }) {
  let lista = (sucursales || []).filter((s) => s && s.active !== false);
  if (branch) {
    const propia = lista.filter((s) => s.name === branch || s.id === branch);
    if (propia.length) lista = propia;
  }
  const general = resumenHorario(businessSettings?.schedule);
  const bloques = lista.map((s) => {
    const lineas = [`📍 *${s.name || 'Sucursal'}*`];
    if (s.address) lineas.push(String(s.address).trim());
    const link = linkComoLlegar(s);
    if (link) lineas.push(`Cómo llegar: ${link}`);
    const horario = String(s.schedule || '').trim() || general;
    if (horario) lineas.push(`🕒 ${horario.replace(/\n/g, '\n    ')}`);
    return lineas.join('\n');
  });
  if (bloques.length === 0 && general) bloques.push(`🕒 Horario:\n${general}`);
  return bloques.length ? bloques.join('\n\n') : null;
}

/**
 * Lista de servicios con precio para el cuerpo de un mensaje (máx. `max`
 * caracteres; el resto se resume en "y N más").
 * `precioDe(servicio)` devuelve el texto del precio ("Bs 100 – 150").
 */
export function textoServicios(servicios = [], { precioDe, duracionDe, max = 900 } = {}) {
  const lineas = servicios.map((s) => `• ${s.name} — ${precioDe(s)} · ${duracionDe(s)} min`);
  const completo = lineas.join('\n');
  let corto = '';
  let incluidos = 0;
  for (const l of lineas) {
    const siguiente = corto ? `${corto}\n${l}` : l;
    if (siguiente.length > max) break;
    corto = siguiente;
    incluidos++;
  }
  const faltan = lineas.length - incluidos;
  if (faltan > 0) corto += `\n… y ${faltan} más.`;
  return { completo, corto };
}
