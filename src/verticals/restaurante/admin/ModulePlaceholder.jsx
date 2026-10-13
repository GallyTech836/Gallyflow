import { Card, Badge } from '../../../shared/ui';

/**
 * Pantalla provisional de un módulo del restaurante (Paso 1).
 * Cada página la reemplaza por su contenido real en su paso.
 */
export default function ModulePlaceholder({ icon: Icon, title, description, features = [], step }) {
  return (
    <Card className="max-w-2xl">
      <div className="flex items-start gap-4">
        {Icon && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-nexus-primary-soft text-nexus-primary">
            <Icon size={24} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-nexus-text">{title}</h3>
            {step && <Badge>{step}</Badge>}
          </div>
          <p className="text-sm text-nexus-text-secondary">{description}</p>
          {features.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-nexus-text-secondary">
              {features.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
