// migrateBranch.routes.js
//
// TEMPORAL: corrige el "branch" de citas históricas en batch, una sola vez.
// Bórralo del proyecto en cuanto lo uses — no tiene autenticación.

import { Router } from 'express';
import { db } from '../config/firebase.js';

const router = Router();

router.post('/admin/migrate-branch', async (req, res) => {
  const { negocioId, oldBranch, newBranch } = req.body || {};
  if (!negocioId || !oldBranch || !newBranch) {
    return res.status(400).json({ error: 'Faltan negocioId, oldBranch, newBranch.' });
  }
  try {
    const citasRef = db.collection('negocios').doc(negocioId).collection('citas');
    const snap = await citasRef.where('branch', '==', oldBranch).get();
    if (snap.empty) return res.status(200).json({ updated: 0 });

    const docs = snap.docs;
    const batchSize = 400;
    let updated = 0;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      docs.slice(i, i + batchSize).forEach((d) => batch.update(d.ref, { branch: newBranch }));
      await batch.commit();
      updated += Math.min(batchSize, docs.length - i);
    }
    return res.status(200).json({ updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;