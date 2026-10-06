import { useEffect, useState } from 'react';

const PLACEHOLDER_IDS = ['photo-1573496359142-b8d87734a5a2'];

export function hasRealAvatar(url) {
  const u = String(url || '').trim();
  return !!u && !PLACEHOLDER_IDS.some((id) => u.includes(id));
}

export function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export default function Avatar({ src, name, className = '', textClassName = 'text-xs', alt }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);

  if (hasRealAvatar(src) && !failed) {
    return <img src={src} alt={alt ?? name ?? ''} className={className} onError={() => setFailed(true)} />;
  }
  return (
    <div
      role="img"
      aria-label={name || 'Sin foto'}
      className={`${className} flex items-center justify-center shrink-0 bg-nexus-primary-soft text-nexus-primary font-black tracking-wide select-none ${textClassName}`}
    >
      {getInitials(name)}
    </div>
  );
}