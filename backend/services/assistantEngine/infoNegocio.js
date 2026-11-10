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
  return /^info_servicios$|precio|servicio|cu[aá]nto\s+(me\s+|te\s+|le\s+|nos\s+)?(cuesta|sale|cobran|cobra|vale|es)|costo|tarifa|cat[aá]logo|lista/i.test(String(texto || ''));
}

/** ¿Pregunta por ubicación / horarios? */
export function pideUbicacion(texto) {
  return /^info_ubicacion$|ubicaci|direcci|d[oó]nde\s+(est[aá]n?|quedan?|es|se encuentran?|los encuentro|atienden)|c[oó]mo\s+llego|mapa|horario|a\s+qu[eé]\s+hora|abren|cierran|atienden/i.test(String(texto || ''));
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

// ───────────── «Servicios y precios» paginado (lista interactiva) ─────────────

export const SERVICIOS_POR_PAGINA = 5;

const recortarTexto = (str, max) => {
  const t = String(str ?? '');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** Página `page` (desde 0) de la lista; si la lista se achicó, la última que exista. */
export function paginaServicios(servicios = [], page = 0, porPagina = SERVICIOS_POR_PAGINA) {
  const paginas = Math.max(1, Math.ceil(servicios.length / porPagina));
  const p = Math.min(Math.max(0, Number.parseInt(page, 10) || 0), paginas - 1);
  return { visibles: servicios.slice(p * porPagina, (p + 1) * porPagina), page: p, paginas, hayMas: p < paginas - 1 };
}

/** "Bs 80 · 30 min", solo con los datos que existen ('' si no hay ninguno). */
export function datosServicio({ precio = '', duracion = '' } = {}) {
  return [precio, duracion].filter(Boolean).join(' · ');
}

/**
 * Fila de lista para un servicio. El id es el del servicio (estable aunque la
 * lista cambie). Si el nombre no cabe en el título (24), va completo en la
 * descripción (72) antes del precio y la duración.
 */
export function filaServicio(servicio, datos = '') {
  const nombre = String(servicio?.name || '').trim();
  const cabeNombre = nombre.length <= 24;
  const descripcion = cabeNombre ? datos : [nombre, datos].filter(Boolean).join(' · ');
  return {
    id: `info_svc|${servicio.id}`,
    title: recortarTexto(nombre, 24),
    ...(descripcion ? { description: recortarTexto(descripcion, 72) } : {}),
  };
}

// ───────────── Preguntas escritas sobre servicios ─────────────

// Minúsculas y sin tildes; la ñ se conserva ("uñas" no es "unas").
export function normalizarTexto(texto) {
  return String(texto || '')
    .toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

const PALABRAS_VACIAS = new Set(`
  a al algo algun alguna alguno ahi aqui asi buen buena buenas bueno buenos con cual cuales cuando cuanto cuanta cuantas cuantos
  como cuesta cuestan costo costos cobran dame de del demora demoran dias disculpa disculpe donde dura duran duracion el ella ellos
  en es esa ese eso esta estan este esto favor gracias hace hacen hay hola holi info informacion la las le les lista
  catalogo lo los mas me mi mis muy necesito noches o ofrecen ofrece para pasar pasas pasen per pero por porfa porfavor
  precio precios puede pueden puedo q que quería queria quiero quisiera saber sale salen se ser seria servicio servicios si
  son su sus tal tambien tarde tardes tarifa tarifas te tendran tendras tiempo tiene tienen tienes tipo todo todos
  tu un una uno unos usted ustedes vale valen y ya ver
  alguien nadie atencion atienden abierto abiertos abren cierran hoy manana mañana horario horarios hora horas
  turno turnos cita citas reserva reservas lugar espacio disponible disponibles disponibilidad local sucursal
`.split(/\s+/).filter(Boolean));

// "cortes" -> "corte", "alisados" -> "alisado"
const raiz = (p) => (p.length > 4 && p.endsWith('s') ? p.slice(0, -1) : p);

function coincide(palabraCliente, palabraServicio) {
  const a = raiz(palabraCliente);
  const b = raiz(palabraServicio);
  if (a === b) return true;
  // Prefijo, solo con palabras de 4+ letras ("trata" -> "tratamiento").
  return a.length >= 4 && b.length >= 4 && (b.startsWith(a) || a.startsWith(b));
}

const PREGUNTA_POR_SERVICIO = /\b(tienen|tiene|hacen|hace|ofrecen|ofrece|hay|cuanto|cuesta|cuestan|precio|precios|costo|cobran|dura|duran|duracion|demora)\b/;

/**
 * Busca lo que el cliente escribió entre los servicios del negocio.
 *   { tipo: 'general' }                         -> "¿qué servicios tienen?", "precios"
 *   { tipo: 'coincidencias', servicios }        -> uno o más servicios que coinciden
 *   { tipo: 'sin_resultado', consulta }         -> pregunta por un servicio que no existe
 *   null                                        -> no es una pregunta sobre servicios
 * `pideLista`: el texto ya pide servicios/precios (pideServicios).
 */
export function buscarServicios(texto, servicios = [], { pideLista = false } = {}) {
  const limpio = normalizarTexto(texto);
  if (!limpio) return null;
  const palabras = [...new Set(limpio.split(' '))]
    .filter((p) => p.length >= 3 && !/^\d+$/.test(p) && !PALABRAS_VACIAS.has(p));

  if (palabras.length === 0) return pideLista ? { tipo: 'general' } : null;

  const puntuados = servicios.map((s) => {
    const nombre = normalizarTexto(s?.name).split(' ').filter((p) => p.length >= 3);
    const puntos = palabras.filter((p) => nombre.some((n) => coincide(p, n))).length;
    return { s, puntos };
  });
  const mejor = Math.max(0, ...puntuados.map((x) => x.puntos));
  if (mejor > 0) {
    return { tipo: 'coincidencias', servicios: puntuados.filter((x) => x.puntos === mejor).map((x) => x.s) };
  }
  // Frases largas sin coincidencias casi nunca son una pregunta por un servicio.
  if (palabras.length <= 3 && (pideLista || PREGUNTA_POR_SERVICIO.test(limpio))) {
    return { tipo: 'sin_resultado', consulta: palabras.join(' ') };
  }
  return null;
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
