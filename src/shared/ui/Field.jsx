import { forwardRef, useId } from 'react';

// En celular los campos usan 16px (text-base): iOS no hace zoom al enfocar.
const CONTROL = 'w-full rounded-lg border bg-nexus-surface px-3 text-base sm:text-sm text-nexus-text placeholder:text-nexus-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-nexus-primary/20 disabled:cursor-not-allowed disabled:bg-nexus-surface-hover disabled:opacity-70';
const border = (error) => (error ? 'border-nexus-error focus:border-nexus-error' : 'border-nexus-border focus:border-nexus-primary');

/** Etiqueta + control + ayuda/error. El control recibe el id automáticamente si no trae uno. */
export function Field({ label, hint, error, required = false, htmlFor, className = '', children }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="text-xs font-medium text-nexus-text-secondary">
          {label}{required && <span className="text-nexus-error"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-xs text-nexus-error-text">{error}</p>
      ) : hint ? (
        <p className="text-xs text-nexus-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ error, className = '', id, ...props }, ref) {
  const auto = useId();
  return <input ref={ref} id={id || auto} aria-invalid={error ? true : undefined} className={`h-10 ${CONTROL} ${border(error)} ${className}`} {...props} />;
});

export const Select = forwardRef(function Select({ error, className = '', id, children, ...props }, ref) {
  const auto = useId();
  return (
    <select ref={ref} id={id || auto} aria-invalid={error ? true : undefined} className={`h-10 cursor-pointer pr-8 ${CONTROL} ${border(error)} ${className}`} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ error, className = '', id, rows = 3, ...props }, ref) {
  const auto = useId();
  return <textarea ref={ref} id={id || auto} rows={rows} aria-invalid={error ? true : undefined} className={`py-2 leading-relaxed ${CONTROL} ${border(error)} ${className}`} {...props} />;
});
