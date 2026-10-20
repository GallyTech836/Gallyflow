// personalidad.js
//
// Personalidad del asistente de WhatsApp (assistantConfig.personalidad).
// Copia intencional en src/shared/assistant/personalidad.js (la usa la vista
// previa del Admin). Si cambias una, cambia la otra: tests/personalidad.test.js
// verifica que sean iguales.
//
// Funciones puras, sin Firebase. La personalidad SOLO cambia cómo habla el
// bot (saludos, despedidas, trato tú/usted, emojis). Nunca cambia botones,
// opciones, horarios, precios ni el flujo de reserva.
//
// Forma guardada en Firestore (todo opcional; sin nada = como siempre):
//   assistantConfig.personalidad = {
//     tono: 'amigable' | 'formal' | 'profesional' | 'cercano' | 'entusiasta' | 'breve',
//     emojis: true | false | null,   // null/ausente = lo que trae el tono
//     saludo: '',                    // saludo propio; {nombre} y {negocio} opcionales
//     despedida: '',                 // texto extra al confirmar una cita
//   }
//
// Días cerrados / feriados (businessSettings.closedDays): cada tono tiene su
// forma de avisar que hoy no se atiende (cerrado / cerradoPregunta / sinEquipo).

export const TONO_POR_DEFECTO = 'amigable';
const MAX_TEXTO = 300;

// h = hora del negocio (0-23), para "Buenos días / tardes / noches".
function saludoPorHora(h) {
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
const conNombre = (base, nombre, signo = '') => `${base}${nombre ? ` ${nombre}` : ''}${signo}`;

export const TONOS = {
  amigable: {
    label: 'Amigable',
    descripcion: 'Cálido y cercano, trata de «tú». Es el estilo de siempre.',
    trato: 'tu',
    emojis: true,
    saludo: ({ nombre }) => conNombre('Hola', nombre, ' 👋'),
    presentacion: ({ negocio }) => `Soy el asistente de ${negocio}.`,
    ayuda: '¿En qué te ayudo?',
    gracias: '¡Gracias!',
    noEntendi: 'No entendí.',
    anuncio: ({ negocio }) => `Gracias por escribir a ${negocio}.`,
    preguntaInfo: '¿Qué información te gustaría?',
    humano: 'Listo, le avisé al equipo. Una persona te responderá por aquí en breve. 🙌',
    cerrado: ({ motivo, vuelve }) => `Hoy no estamos atendiendo${motivo} 🙏${vuelve ? ` Volvemos ${vuelve}.` : ''}`,
    cerradoPregunta: '¿Quieres agendar para otro día?',
    sinEquipo: 'Hoy no hay nadie del equipo para responderte por aquí, pero puedo ayudarte a agendar para otro día.',
  },
  formal: {
    label: 'Formal',
    descripcion: 'Respetuoso y cortés, trata de «usted». Sin emojis.',
    trato: 'usted',
    emojis: false,
    saludo: ({ nombre, hora }) => (nombre ? `${saludoPorHora(hora)}, ${nombre}.` : `${saludoPorHora(hora)}.`),
    presentacion: ({ negocio }) => `Le saluda el asistente virtual de ${negocio}.`,
    ayuda: '¿En qué puedo ayudarle?',
    gracias: 'Muchas gracias por su preferencia.',
    noEntendi: 'Disculpe, no comprendí su respuesta.',
    anuncio: ({ negocio }) => `Gracias por comunicarse con ${negocio}.`,
    preguntaInfo: '¿Qué información desea conocer?',
    humano: 'Con gusto. Ya informé a nuestro equipo y una persona le atenderá por este medio en breve.',
    cerrado: ({ motivo, vuelve }) => `Le informamos que hoy no estamos atendiendo${motivo}.${vuelve ? ` Retomamos la atención ${vuelve}.` : ''}`,
    cerradoPregunta: '¿Desea agendar para otro día?',
    sinEquipo: 'Hoy no contamos con personal para atenderle por este medio, pero con gusto puedo ayudarle a agendar para otro día.',
  },
  profesional: {
    label: 'Profesional',
    descripcion: 'Claro y directo, con pocos emojis. Trata de «tú».',
    trato: 'tu',
    emojis: true,
    saludo: ({ nombre }) => conNombre('Hola', nombre, '.'),
    presentacion: ({ negocio }) => `Te escribe el asistente de reservas de ${negocio}.`,
    ayuda: '¿Cómo podemos ayudarte?',
    gracias: 'Te esperamos.',
    noEntendi: 'No pude entender tu respuesta.',
    anuncio: ({ negocio }) => `Gracias por contactar a ${negocio}.`,
    preguntaInfo: '¿Qué información necesitas?',
    humano: 'Listo, avisé al equipo. Una persona te responderá por aquí en breve.',
    cerrado: ({ motivo, vuelve }) => `Hoy no tenemos atención${motivo}.${vuelve ? ` Volvemos a atender ${vuelve}.` : ''}`,
    cerradoPregunta: '¿Quieres reservar para otro día?',
    sinEquipo: 'Hoy el equipo no está disponible por aquí. Puedo ayudarte a reservar para otro día.',
  },
  cercano: {
    label: 'Cercano',
    descripcion: 'Relajado y juvenil, como un amigo. Usa más emojis.',
    trato: 'tu',
    emojis: true,
    saludo: ({ nombre }) => conNombre('¡Hola', nombre, '! 😄'),
    presentacion: ({ negocio }) => `Aquí el asistente de ${negocio} 🙌`,
    ayuda: '¿Qué hacemos hoy?',
    gracias: '¡Nos vemos pronto! 🙌',
    noEntendi: 'Ups, no te entendí 😅',
    anuncio: ({ negocio }) => `¡Qué bueno que escribiste a ${negocio}! 🙌`,
    preguntaInfo: '¿Qué te gustaría saber?',
    humano: '¡Hecho! Ya le avisé al equipo y alguien te escribe por aquí en un ratito 🙌',
    cerrado: ({ motivo, vuelve }) => `¡Hoy estamos cerrados${motivo}! 😴${vuelve ? ` Volvemos ${vuelve}.` : ''}`,
    cerradoPregunta: '¿Te agendo para otro día?',
    sinEquipo: 'Hoy no hay nadie del equipo por aquí 😅 pero te puedo agendar para otro día.',
  },
  entusiasta: {
    label: 'Entusiasta',
    descripcion: 'Alegre y con mucha energía, ideal para promociones.',
    trato: 'tu',
    emojis: true,
    saludo: ({ nombre }) => conNombre('¡Hola', nombre, '! 🎉'),
    presentacion: ({ negocio }) => `¡Qué gusto saludarte! Soy el asistente de ${negocio} ✨`,
    ayuda: '¿En qué te puedo ayudar hoy?',
    gracias: '¡Te esperamos con muchas ganas! ✨',
    noEntendi: '¡Uy! No logré entenderte 🙈',
    anuncio: ({ negocio }) => `¡Gracias por escribir a ${negocio}! ✨`,
    preguntaInfo: '¿Qué te gustaría conocer?',
    humano: '¡Perfecto! Ya avisé al equipo y una persona te responderá por aquí muy pronto 🙌',
    cerrado: ({ motivo, vuelve }) => `¡Hoy nos tomamos el día${motivo}! 🎈${vuelve ? ` Volvemos ${vuelve} con todo ✨` : ''}`,
    cerradoPregunta: '¿Te gustaría agendar para otro día?',
    sinEquipo: 'Hoy el equipo está descansando 😊 pero yo te ayudo a agendar para otro día ✨',
  },
  breve: {
    label: 'Breve',
    descripcion: 'Mensajes cortos y al grano, sin emojis.',
    trato: 'tu',
    emojis: false,
    saludo: ({ nombre }) => conNombre('Hola', nombre, '.'),
    presentacion: ({ negocio }) => `Reservas de ${negocio}.`,
    ayuda: '¿Qué necesitas?',
    gracias: 'Gracias.',
    noEntendi: 'No entendí.',
    anuncio: ({ negocio }) => `Reservas de ${negocio}.`,
    preguntaInfo: '¿Qué quieres saber?',
    humano: 'Listo, avisé al equipo. Te responderán por aquí.',
    cerrado: ({ motivo, vuelve }) => `Hoy cerrado${motivo}.${vuelve ? ` Abrimos ${vuelve}.` : ''}`,
    cerradoPregunta: '¿Agendas para otro día?',
    sinEquipo: 'Hoy no hay atención del equipo. Puedo agendarte para otro día.',
  },
};

export const LISTA_TONOS = Object.entries(TONOS).map(([id, t]) => ({ id, label: t.label, descripcion: t.descripcion }));

function limpiarTexto(v) {
  return typeof v === 'string' ? v.trim().slice(0, MAX_TEXTO) : '';
}

/** Normaliza lo guardado en Firestore. Sin datos => tono amigable, como siempre. */
export function normalizarPersonalidad(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const tono = TONOS[r.tono] ? r.tono : TONO_POR_DEFECTO;
  return {
    tono,
    emojis: typeof r.emojis === 'boolean' ? r.emojis : null,
    saludo: limpiarTexto(r.saludo),
    despedida: limpiarTexto(r.despedida),
  };
}

function rellenar(texto, { nombre, negocio }) {
  // Sin nombre se quita también la coma o el espacio que lo acompaña.
  const conNombreRe = nombre ? /\{nombre\}/gi : /\s*,?\s*\{nombre\}/gi;
  return texto
    .replace(conNombreRe, nombre || '')
    .replace(/\{negocio\}/gi, negocio || '')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// ── tú → usted (solo frases fijas del asistente) ──
// Se aplica al texto que escribe el bot. Lista cerrada y con límites de
// palabra para no tocar nombres de servicios o de personas.
const A_USTED = [
  [/¿Con quién deseas atenderte\?/g, '¿Con quién desea atenderse?'],
  [/según quién te atienda/g, 'según quién le atienda'],
  [/\bte atenderá\b/g, 'le atenderá'],
  [/\bTe atenderá\b/g, 'Le atenderá'],
  [/\bte responderá\b/g, 'le responderá'],
  [/\bte ayuda\b/g, 'le ayuda'],
  [/\bte ayudo\b/g, 'le ayudo'],
  [/\bte asignará\b/g, 'le asignará'],
  [/\bte gustaría\b/g, 'le gustaría'],
  [/\bTe gustaría\b/g, 'Le gustaría'],
  [/\bte la pasa\b/g, 'se la pasa'],
  [/\bdeseas\b/g, 'desea'],
  [/\bquieres\b/g, 'quiere'],
  [/\bQuieres\b/g, 'Quiere'],
  [/\bagregas\b/g, 'agrega'],
  [/\bagendas\b/g, 'agenda'],
  [/\btienes\b/g, 'tiene'],
  [/\bTienes\b/g, 'Tiene'],
  [/\bprefieras\b/g, 'prefiera'],
  [/\belijas\b/g, 'elija'],
  [/\bEscribe\b/g, 'Escriba'],
  [/\bescribe\b/g, 'escriba'],
  [/\bToca\b/g, 'Toque'],
  [/\btoca\b/g, 'toque'],
  [/\bElige\b/g, 'Elija'],
  [/\belige\b/g, 'elija'],
  [/\bConfirma\b/g, 'Confirme'],
  [/\bReprogramemos tu\b/g, 'Reprogramemos su'],
  [/\btu\b/g, 'su'],
  [/\bTu\b/g, 'Su'],
  [/\btus\b/g, 'sus'],
  [/\bTus\b/g, 'Sus'],
  [/\bcontigo\b/g, 'con usted'],
];

export function aUsted(texto) {
  if (!texto) return texto;
  return A_USTED.reduce((t, [re, rep]) => t.replace(re, rep), String(texto));
}

const EMOJI = /(\p{Extended_Pictographic}|\p{Regional_Indicator})(️|‍(\p{Extended_Pictographic}))*/gu;
export function quitarEmojis(texto) {
  if (!texto) return texto;
  return String(texto)
    .replace(EMOJI, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+/gm, '')
    .trim();
}

/**
 * "Voz" del asistente para un negocio: frases de cada momento y el
 * post-proceso (usted / sin emojis) del mensaje final.
 */
export function crearVoz(rawPersonalidad, { negocio = '', hora = 12 } = {}) {
  const p = normalizarPersonalidad(rawPersonalidad);
  const t = TONOS[p.tono];
  const usaEmojis = p.emojis === null ? t.emojis : p.emojis;
  const usted = t.trato === 'usted';

  const frase = (s) => {
    let out = s;
    if (usted) out = aUsted(out);
    if (!usaEmojis) out = quitarEmojis(out);
    return out;
  };

  return {
    tono: p.tono,
    usted,
    usaEmojis,
    config: p,
    /** Primera línea de la bienvenida (saludo propio si existe). */
    bienvenida(nombre) {
      if (p.saludo) return frase(rellenar(p.saludo, { nombre, negocio }));
      return frase(`${t.saludo({ nombre, hora })} ${t.presentacion({ negocio })}`);
    },
    /** Saludo corto (sin presentación) para mensajes con citas. */
    saludo(nombre) {
      if (p.saludo) return frase(rellenar(p.saludo, { nombre, negocio }));
      return frase(`${t.saludo({ nombre, hora })} ${t.presentacion({ negocio })}`);
    },
    ayuda: () => frase(t.ayuda),
    gracias: () => frase(t.gracias),
    noEntendi: () => frase(t.noEntendi),
    anuncio(nombre) {
      if (p.saludo) return frase(rellenar(p.saludo, { nombre, negocio }));
      return frase(`${t.saludo({ nombre, hora })} ${t.anuncio({ negocio })}`);
    },
    preguntaInfo: () => frase(t.preguntaInfo),
    humano: () => frase(t.humano),
    /**
     * Día cerrado / feriado: "Hoy no estamos atendiendo (Feriado) 🙏 Volvemos mañana."
     * `motivo` = businessSettings.closedDays[].reason (opcional); `vuelve` = "mañana" / "el lunes".
     */
    cerrado: ({ motivo = '', vuelve = '' } = {}) => frase(t.cerrado({ motivo: motivo ? ` (${motivo})` : '', vuelve })),
    cerradoPregunta: () => frase(t.cerradoPregunta),
    sinEquipo: () => frase(t.sinEquipo),
    despedida: () => (p.despedida ? frase(rellenar(p.despedida, { nombre: '', negocio })) : ''),
    /** Post-proceso de TODO lo que envía el bot. */
    texto: (s) => (typeof s === 'string' ? frase(s) : s),
    titulo: (s) => (typeof s === 'string' && !usaEmojis ? quitarEmojis(s) : s),
  };
}

/** Aplica la voz a una respuesta del motor ({ replyText, interactive, preMessages }). */
export function aplicarVoz(resultado, voz) {
  if (!resultado || !voz) return resultado;
  const inter = (i) => {
    if (!i) return i;
    const out = JSON.parse(JSON.stringify(i));
    if (out.body?.text) out.body.text = voz.texto(out.body.text);
    for (const b of out.action?.buttons || []) if (b.reply?.title) b.reply.title = voz.titulo(b.reply.title);
    for (const sec of out.action?.sections || []) {
      for (const r of sec.rows || []) {
        if (r.title) r.title = voz.titulo(r.title);
        if (r.description) r.description = voz.usted ? voz.titulo(aUsted(r.description)) : voz.titulo(r.description);
      }
    }
    return out;
  };
  return {
    ...resultado,
    replyText: voz.texto(resultado.replyText),
    interactive: inter(resultado.interactive),
    preMessages: (resultado.preMessages || []).map((pm) => ({ ...pm, interactive: inter(pm.interactive) })),
  };
}
