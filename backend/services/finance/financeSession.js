// Token de sesión firmado (HMAC), sin dependencias extra ni estado en
// memoria — válido aunque Railway reinicie el proceso. Dura 15 minutos.

import crypto from 'node:crypto';

const SECRET = process.env.FINANCE_SESSION_SECRET || 'dev-secret-cambiar-en-produccion';
const DURATION_MS = 15 * 60 * 1000;

export function createSessionToken(negocioId) {
  const payload = JSON.stringify({ negocioId, exp: Date.now() + DURATION_MS });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('hex');
  return `${payloadB64}.${signature}`;
}

export function verifySessionToken(token, negocioId) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payloadB64, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(payloadB64).digest('hex');
  if (signature !== expected) return false;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    return payload.negocioId === negocioId && payload.exp > Date.now();
  } catch {
    return false;
  }
}