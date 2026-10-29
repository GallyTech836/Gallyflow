// Vistas Mes y Año de la agenda de BarberApp, compartidas con "Servicios
// registrados" del barbero. Mismo aspecto que tenía la agenda; los datos y
// las acciones los pone quien las usa.
import { monthGrid42 } from './calendarGrid';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES_NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * Calendario del mes (42 recuadros) con un punto por cada elemento del día.
 * - dateStr: cualquier día del mes ('AAAA-MM-DD')
 * - selected: día resaltado
 * - dotsFor(dateStr) -> [{ key, className, title }]
 * - onPick(dateStr)
 * - isDisabled(dateStr): días sin acción (ej. futuros). Opcional.
 * - maxDots: si hay más puntos que esto, se muestra el número. Opcional
 *   (la agenda no lo usa: muestra todos los puntos).
 * - countTone: clases del número cuando reemplaza a los puntos.
 */
export function BarberMonthGrid({ dateStr, selected, dotsFor, onPick, isDisabled, maxDots, countTone = 'bg-nexus-success-bg text-nexus-success-text' }) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-nexus-surface border border-nexus-border rounded-3xl p-4 shadow-lg overflow-hidden">
        {/* Cabecera de los días de la semana */}
        <div className="grid grid-cols-7 gap-1 text-center border-b border-nexus-border pb-3 select-none">
          {DIAS_SEMANA.map((d) => (
            <span key={d} className="text-xs  font-bold text-nexus-primary">
              {d.slice(0, 3)}
            </span>
          ))}
        </div>

        {/* Grilla de Días */}
        <div className="grid grid-cols-7 gap-1.5 pt-3">
          {monthGrid42(dateStr).map((gridItem, idx) => {
            const dots = dotsFor(gridItem.dateStr) || [];
            const isSelected = gridItem.dateStr === selected;
            const disabled = !!isDisabled?.(gridItem.dateStr);
            const asNumber = maxDots != null && dots.length > maxDots;
            return (
              <div
                key={idx}
                role={disabled ? undefined : 'button'}
                tabIndex={disabled ? undefined : 0}
                aria-disabled={disabled || undefined}
                onClick={disabled ? undefined : () => onPick(gridItem.dateStr)}
                onKeyDown={disabled ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(gridItem.dateStr); } }}
                className={`min-h-[70px] sm:min-h-[85px] p-1.5 rounded-xl border flex flex-col justify-between transition-all duration-200 ${disabled ? 'cursor-default' : 'cursor-pointer'} ${
                  isSelected
                    ? 'bg-nexus-primary-soft border-nexus-primary shadow-sm'
                    : gridItem.isCurrentMonth
                    ? `bg-nexus-background border-nexus-border ${disabled ? 'opacity-50' : 'hover:bg-nexus-surface-hover'}`
                    : `bg-transparent border-transparent opacity-30 ${disabled ? '' : 'hover:opacity-50'}`
                }`}
              >
                <span className={`text-xs font-bold ${isSelected ? 'text-nexus-primary' : 'text-nexus-text-secondary'}`}>
                  {gridItem.dayNum}
                </span>

                {/* Indicadores (un punto por elemento) */}
                <div className="flex flex-wrap gap-1 mt-1 justify-start">
                  {asNumber ? (
                    <span className={`min-w-6 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-xs font-bold nx-num ${countTone}`}>
                      {dots.length}
                    </span>
                  ) : dots.map((dot) => (
                    <div key={dot.key} className={`w-2 h-2 rounded-full ${dot.className}`} title={dot.title} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Tarjetas del año (2 columnas en celular), nombre completo del mes y número grande.
 * - title / subtitle: encabezado de la tarjeta grande (subtitle opcional)
 * - countFor(monthIndex 0–11), unitLabel ("Reservas", "Servicios")
 * - extraFor(monthIndex): línea opcional debajo (ej. total en Bs)
 * - onPick(monthIndex): opcional; sin él las tarjetas no se pueden tocar (agenda)
 * - isDisabled(monthIndex): meses sin acción. Opcional.
 */
export function BarberYearCards({ title, subtitle, countFor, unitLabel, extraFor, onPick, isDisabled }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-nexus-surface border border-nexus-border p-5 rounded-2xl">
        <h3 className="text-sm font-bold text-nexus-text mb-1">{title}</h3>
        {subtitle && <p className="text-xs text-nexus-text-muted">{subtitle}</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-5">
          {MESES_NOMBRES.map((name, monthIndex) => {
            const extra = extraFor?.(monthIndex);
            const body = (
              <>
                <span className="text-xs font-bold text-nexus-text-secondary">{name}</span>
                <div className="mt-2">
                  <span className="text-2xl font-bold text-nexus-text">{countFor(monthIndex) || 0}</span>
                  <span className="text-xs text-nexus-text-muted block">{unitLabel}</span>
                  {extra != null && <span className="text-xs font-semibold text-nexus-text nx-num block mt-0.5">{extra}</span>}
                </div>
              </>
            );
            const base = 'bg-nexus-surface-hover border border-nexus-border p-4 rounded-xl flex flex-col justify-between';
            const height = extra != null ? 'min-h-28' : 'h-28';
            if (!onPick) return <div key={monthIndex} className={`${base} ${height}`}>{body}</div>;
            const disabled = !!isDisabled?.(monthIndex);
            return (
              <button
                type="button"
                key={monthIndex}
                disabled={disabled}
                onClick={() => onPick(monthIndex)}
                className={`${base} ${height} text-left transition-colors ${disabled ? 'opacity-50 cursor-default' : 'hover:border-nexus-primary/50 cursor-pointer'}`}
              >
                {body}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
