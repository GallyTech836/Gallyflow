// mapsLink.js
// Arma el link de Google Maps ("Cómo llegar") a partir de una sucursal
// (negocios/{id}/sucursales/{id}: name, address, lat, lng).

// Coordenadas que AdminApp asigna por defecto a una sucursal nueva. Si
// siguen siendo estas, el pin nunca se movió: es más fiable la dirección.
const DEFAULT_LAT = -17.7732;
const DEFAULT_LNG = -63.1821;

export function buildDirectionsUrl(branch) {
  if (!branch) return null;
  const customMatch = String(branch.mapsUrl || '').match(/https?:\/\/\S+/);
  const custom = customMatch ? customMatch[0] : '';
  if (/^https?:\/\/(([a-z0-9-]+\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/|share\.google\/)/i.test(custom)) {
    return custom;
  }
  const lat = Number(branch.lat);
  const lng = Number(branch.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const isDefaultPin = hasCoords && lat === DEFAULT_LAT && lng === DEFAULT_LNG;
  const address = (branch.address || '').trim();

  let destination = null;
  if (hasCoords && !isDefaultPin) destination = `${lat},${lng}`;
  else if (address) destination = [branch.name, address].filter(Boolean).join(', ');
  else if (hasCoords) destination = `${lat},${lng}`;

  if (!destination) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
}
