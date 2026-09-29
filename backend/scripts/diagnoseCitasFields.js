// SOLO LECTURA. No escribe ni modifica nada.
// Revisa una muestra de citas ANTIGUAS y NUEVAS de un negocio y resume qué campos tienen realmente.
//
// Uso (desde la carpeta backend, con las variables FIREBASE_* configuradas):
//   node scripts/diagnoseCitasFields.js <negocioId>
// En Railway:  railway run node scripts/diagnoseCitasFields.js <negocioId>
//
// Lee como máximo 300 citas antiguas + 100 recientes (≈ 400 lecturas).

import { db } from '../config/firebase.js';

const negocioId = process.argv[2];
if (!negocioId) {
  console.error('Falta el negocioId. Uso: node scripts/diagnoseCitasFields.js <negocioId>');
  process.exit(1);
}

const TIME_OK = /^\d{2}:\d{2}$/;
const has = (v) => v !== undefined && v !== null && v !== '';

function resumir(nombre, docs) {
  const r = {
    total: docs.length,
    conProfessionalId: 0, conBarberId: 0, conBarber: 0,
    sinNingunCampoDeProfesional: 0,
    professionalIdDistintoDeBarberId: 0,
    conBranch: 0, sinBranch: 0,
    conUpdatedAt: 0, sinUpdatedAt: 0,
    timeConFormatoHHMM: 0, timeOtroFormato: 0, sinTime: 0,
    priceNumero: 0, priceTexto: 0, priceOtro: 0,
    estados: {},
    fechaMin: null, fechaMax: null,
  };
  for (const c of docs) {
    const p = has(c.professionalId), b = has(c.barberId), o = has(c.barber);
    if (p) r.conProfessionalId++;
    if (b) r.conBarberId++;
    if (o) r.conBarber++;
    if (!p && !b && !o) r.sinNingunCampoDeProfesional++;
    if (p && b && c.professionalId !== c.barberId) r.professionalIdDistintoDeBarberId++;
    if (has(c.branch)) r.conBranch++; else r.sinBranch++;
    if (has(c.updatedAt)) r.conUpdatedAt++; else r.sinUpdatedAt++;
    if (!has(c.time)) r.sinTime++; else if (TIME_OK.test(String(c.time))) r.timeConFormatoHHMM++; else r.timeOtroFormato++;
    if (typeof c.price === 'number') r.priceNumero++; else if (typeof c.price === 'string') r.priceTexto++; else r.priceOtro++;
    r.estados[c.status ?? '(sin estado)'] = (r.estados[c.status ?? '(sin estado)'] || 0) + 1;
    if (c.date) {
      if (!r.fechaMin || c.date < r.fechaMin) r.fechaMin = c.date;
      if (!r.fechaMax || c.date > r.fechaMax) r.fechaMax = c.date;
    }
  }
  console.log(`\n=== ${nombre} ===`);
  console.log(JSON.stringify(r, null, 2));
}

const citasRef = db.collection('negocios').doc(negocioId).collection('citas');
const [viejas, recientes] = await Promise.all([
  citasRef.orderBy('date', 'asc').limit(300).get(),
  citasRef.orderBy('date', 'desc').limit(100).get(),
]);

resumir('CITAS MÁS ANTIGUAS (hasta 300)', viejas.docs.map((d) => d.data()));
resumir('CITAS MÁS RECIENTES (hasta 100)', recientes.docs.map((d) => d.data()));
console.log('\nListo. Esto fue solo lectura.');
process.exit(0);
