import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, getDocs } from 'firebase/firestore';
import { db } from './config';

export function useServicios(uid) {
  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;

    const ref = collection(db, 'negocios', uid, 'servicios');
    const unsub = onSnapshot(ref, (snap) => {
      setServicios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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

    await setDoc(doc(db, 'negocios', uid, 'servicios', shortId), datos);
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