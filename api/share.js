// Vista previa de los links públicos de reserva (WhatsApp, Facebook,
// Instagram, Telegram...).
//
// Esos servicios no ejecutan JavaScript: leen las etiquetas og:* del HTML.
// vercel.json manda aquí SOLO a esos bots (por user-agent); las personas
// siguen cargando la app normal. Devuelve un HTML mínimo con el nombre y el
// logo del negocio (heroConfig). Si no hay negocio o no tiene logo, usa Nexus.

import { isReservedSlug } from '../src/shared/booking/publicRoutes.js';

const FIREBASE_PROJECT = 'gally-flow';
const FIREBASE_API_KEY = 'AIzaSyDioxAn9-8TbZsONAQV9XrTX4krbCBbED4';
const DEFAULT_BUSINESS_NAMES = ['GALLYFLOW', 'Nexus']; // valores por defecto de heroConfig
const DEFAULT_SLOGAN_START = 'Agenda citas de forma rápida';

const NEXUS = {
  title: 'Nexus',
  description: 'Nexus — Sistema de reservas y gestión para negocios de servicios.',
  image: '/icon-512.png',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Logo sin bordes de color liso (e_trim), recortado en cuadrado, en JPG y liviano. WhatsApp no muestra SVG,
 * así que un logo SVG fuera de Cloudinary cae al ícono de Nexus.
 */
function previewImage(url) {
  if (typeof url !== 'string' || !url.startsWith('http')) return '';
  if (url.includes('res.cloudinary.com') && url.includes('/image/upload/')) {
    return url.replace('/image/upload/', '/image/upload/e_trim/c_fill,g_auto,w_600,h_600,f_jpg,q_80/');
  }
  if (/\.svg(\?|#|$)/i.test(url)) return '';
  return url;
}

async function getHeroConfig(slug) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}`
    + `/databases/(default)/documents/negocios/${encodeURIComponent(slug)}`
    + `?key=${FIREBASE_API_KEY}&mask.fieldPaths=heroConfig`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) return null;
  const data = await res.json();
  const fields = data?.fields?.heroConfig?.mapValue?.fields || {};
  const text = (key) => String(fields[key]?.stringValue || '').trim();
  return { businessName: text('businessName'), logo: text('logo'), slogan: text('slogan') };
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'nexusbo.vercel.app';
  const origin = `https://${host}`;
  const slug = String(req.query.slug || req.query.negocio || '').toLowerCase();
  const pageUrl = `${origin}${req.url && !req.url.startsWith('/api/') ? req.url : slug ? `/${slug}` : '/'}`;

  let meta = { ...NEXUS, image: `${origin}${NEXUS.image}` };

  if (/^[a-z0-9]+$/.test(slug) && !isReservedSlug(slug)) {
    try {
      const hero = await getHeroConfig(slug);
      if (hero) {
        const name = hero.businessName && !DEFAULT_BUSINESS_NAMES.includes(hero.businessName)
          ? hero.businessName
          : '';
        const slogan = hero.slogan && !hero.slogan.startsWith(DEFAULT_SLOGAN_START) ? hero.slogan : '';
        if (name) {
          meta = {
            title: name,
            description: slogan || `Reserva tu cita en ${name}.`,
            image: previewImage(hero.logo) || meta.image,
          };
        }
      }
    } catch {
      // Firestore no respondió: se queda la vista previa de Nexus.
    }
  }

  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const img = escapeHtml(meta.image);
  const u = escapeHtml(pageUrl);
  const size = meta.image.includes('res.cloudinary.com') ? 600 : meta.image.endsWith('/icon-512.png') ? 512 : 0;
  const dims = size
    ? `<meta property="og:image:width" content="${size}" />\n<meta property="og:image:height" content="${size}" />\n`
    : '';

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>${t}</title>
<meta name="description" content="${d}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Nexus" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:image" content="${img}" />
${dims}<meta property="og:url" content="${u}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${img}" />
</head>
<body><a href="${u}">${t}</a></body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // 5 min en caché: un logo nuevo se ve en los links compartidos después de eso.
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
}
