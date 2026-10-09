/** Etiqueta de estado. tone: neutral | primary | success | warning | danger | info. */
const TONES = {
    neutral: 'bg-nexus-surface-hover text-nexus-text-secondary border-nexus-border',
    primary: 'bg-nexus-primary-soft text-nexus-primary border-nexus-primary/20',
    success: 'bg-nexus-success-bg text-nexus-success-text border-nexus-success/25',
    warning: 'bg-nexus-warning-bg text-nexus-warning-text border-nexus-warning/30',
    danger: 'bg-nexus-error-bg text-nexus-error-text border-nexus-error/25',
    info: 'bg-nexus-info-bg text-nexus-info-text border-nexus-info/25',
  };
  
  export default function Badge({ tone = 'neutral', icon: Icon = null, className = '', children }) {
    return (
      <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone] || TONES.neutral} ${className}`}>
        {Icon && <Icon size={12} aria-hidden="true" />}
        {children}
      </span>
    );
  }
  