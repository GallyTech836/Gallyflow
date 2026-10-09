import { useState } from 'react';
import Spinner from './Spinner';

// Variantes limitadas a propósito: una sola apariencia por tipo de acción.
const VARIANTS = {
  primary: 'bg-nexus-primary text-white hover:bg-nexus-primary-hover shadow-sm',
  secondary: 'bg-nexus-surface text-nexus-text border border-nexus-border hover:bg-nexus-surface-hover',
  ghost: 'bg-transparent text-nexus-text-secondary hover:bg-nexus-surface-hover hover:text-nexus-text',
  danger: 'bg-nexus-error text-white hover:brightness-95 shadow-sm',
  'danger-soft': 'bg-nexus-error-bg text-nexus-error-text hover:brightness-95',
};

// Alturas mínimas pensadas para el dedo: 40px (md) en celular.
const SIZES = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
  icon: 'h-10 w-10 p-0',
};

/**
 * Botón de Nexus.
 * - `loading`: muestra spinner y bloquea clics.
 * - Si `onClick` devuelve una promesa, el botón se bloquea solo hasta que
 *   termine: evita operaciones duplicadas por doble clic sin tocar la lógica.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon = null,
  iconRight: IconRight = null,
  fullWidth = false,
  type = 'button',
  className = '',
  onClick,
  children,
  ...rest
}) {
  const [busy, setBusy] = useState(false);
  const isLoading = loading || busy;
  const isDisabled = disabled || isLoading;

  async function handleClick(e) {
    if (isDisabled) { e.preventDefault(); return; }
    const result = onClick?.(e);
    if (result && typeof result.then === 'function') {
      setBusy(true);
      try { await result; } finally { setBusy(false); }
    }
  }

  const iconSize = size === 'sm' ? 16 : 18;
  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      className={`inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg font-semibold transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {isLoading ? <Spinner size="sm" /> : Icon ? <Icon size={iconSize} aria-hidden="true" /> : null}
      {children}
      {!isLoading && IconRight ? <IconRight size={iconSize} aria-hidden="true" /> : null}
    </button>
  );
}
