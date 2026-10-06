export function buildWhatsAppUrl(phone, message = '') {
    const raw = String(phone || '').trim();
    if (!raw || ['n/a', 'no especificado'].includes(raw.toLowerCase())) return null;
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.length < 7) return null;
    if (!raw.startsWith('+') && /^[367]\d{7}$/.test(digits)) digits = `591${digits}`;
    const text = message ? `?text=${encodeURIComponent(message)}` : '';
    return `https://wa.me/${digits}${text}`;
  }