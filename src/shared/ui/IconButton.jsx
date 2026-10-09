/** Botón solo-ícono con área táctil de 40px y etiqueta accesible obligatoria. */
const TONES = {
    neutral: 'text-nexus-text-secondary hover:bg-nexus-surface-hover hover:text-nexus-text',
    primary: 'text-nexus-primary hover:bg-nexus-primary-soft',
    danger: 'text-nexus-error-text hover:bg-nexus-error-bg',
  };
  
  export default function IconButton({ icon: Icon, label, tone = 'neutral', size = 18, className = '', type = 'button', ...rest }) {
    return (
      <button
        type={type}
        aria-label={label}
        title={label}
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${TONES[tone] || TONES.neutral} ${className}`}
        {...rest}
      >
        <Icon size={size} aria-hidden="true" />
      </button>
    );
  }
  