import { Router } from 'express';
import { assistantEngine } from '../services/assistantEngine/engine.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Ruta de prueba manual (sin WhatsApp todavía): simula un mensaje entrante.
// Body: { negocioId, phone, message }
// Protegida: solo responde si ASSISTANT_TEST_KEY está configurada en Railway
// y la petición manda el header x-assistant-test-key con ese valor.
router.post('/assistant/test', async (req, res) => {
  const clave = process.env.ASSISTANT_TEST_KEY;
  if (!clave || req.get('x-assistant-test-key') !== clave) {
    return res.status(404).json({ error: 'Ruta no encontrada.' });
  }
  const { negocioId, phone, message } = req.body || {};
  if (!negocioId || !phone) {
    return res.status(400).json({ error: 'Faltan negocioId y/o phone.' });
  }
  try {
    const result = await assistantEngine({ negocioId, phone, message: message || '' });
    return res.status(200).json(result);
  } catch (err) {
    logger.warn('[assistant.routes] assistantEngine falló:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;