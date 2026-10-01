import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, getDocs } from 'firebase/firestore';
import { db } from './config';

// Orden de servicios: primero los que tienen `order` (definido al arrastrar en
// Admin), luego los que no lo tienen por fecha de creación.
export function compareServicios(a, b) {
  const ao = Number.isFinite(a?.order) ? a.order : null;
  const bo = Number.isFinite(b?.order) ? b.order : null;
  if (ao !== null && bo !== null) return ao - bo;
  if (ao !== null) return -1;
  if (bo !== null) return 1;
  return (a?.createdAt || 0) - (b?.createdAt || 0);
}

export function useServicios(uid) {
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;

    const ref = collection(db, 'negocios', uid, 'servicios');
    const unsub = onSnapshot(ref, (snap) => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Orden por fecha de creación real, no por el ID del documento
      // (el ID se reutiliza al borrar servicios, así que no sirve como orden).
      // Los servicios viejos sin createdAt quedan primero (tratados como más antiguos).
      lista.sort(compareServicios);
      setServicios(lista);
      setLoading(false);
    });

    return () => unsub();
  }, [uid]);

  async function agregarServicio(datos) {
    const ref = collection(db, 'negocios', uid, 'servicios');

    // Genera un ID corto tipo s1, s2, s3... buscando el primero libre.
    const snap = await getDocs(ref);
    const existentes = new Set(snap.docs.map(d => d.id));
    let n = 1;
    let shortId = `s${n}`;
    while (existentes.has(shortId)) {
      n++;
      shortId = `s${n}`;
    }

    await setDoc(doc(db, 'negocios', uid, 'servicios', shortId), { ...datos, createdAt: Date.now() });
  }

  async function editarServicio(id, datos) {
    const ref = doc(db, 'negocios', uid, 'servicios', id);
    await updateDoc(ref, datos);
  }

  async function eliminarServicio(id) {
    const ref = doc(db, 'negocios', uid, 'servicios', id);
    await deleteDoc(ref);
  }

  return { servicios, loading, agregarServicio, editarServicio, eliminarServicio };
}