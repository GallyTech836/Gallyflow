// Vistas Mes y Año de la agenda (AdminApp), compartidas con "Servicios
// registrados". Mismo aspecto que tenía la agenda; los datos los pone quien
// las usa.
import { monthDays, WEEKDAY_HEADERS, MONTH_CARDS } from './calendarGrid';

/**
 * Calendario de un mes, de lunes a domingo, con la cantidad de cada día.
 * - dateStr: cualquier día del mes ('AAAA-MM-DD')
 * - countFor(dateStr) -> número de la insignia (0 = sin insignia)
 * - highlighted: día resaltado ('AAAA-MM-DD')
 * - onPick(dateStr): al tocar un día
 * - isDisabled(dateStr): días sin acción (ej. futuros). Opcional.
 * - ariaLabelFor(day, count): texto para lectores de pantalla
 */
export function MonthCalendar({ dateStr, countFor, highlighted, onPick, isDisabled, ariaLabelFor }) {
  return (
    <div className="bg-nexus-surface border border-nexus-border rounded-xl p-2 sm:p-4">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center mb-1.5">
        {WEEKDAY_HEADERS.map((d) => (
          <span key={d} className="text-xs font-semibold text-nexus-text-muted py-1">
            <span className="sm:hidden">{d.charAt(0)}</span>
            <span className="hidden sm:inline">{d}</span>
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {monthDays(dateStr).map((day, idx) => {
          if (!day?.isCurrentMonth) return <div key={idx} className="h-14 sm:h-20" aria-hidden="true" />;
          const count = countFor(day.dateStr) || 0;
          const isSelected = day.dateStr === highlighted;
          const disabled = !!isDisabled?.(day.dateStr);
          return (
            <button
              type="button"
              key={idx}
              onClick={() => onPick(day.dateStr)}
              disabled={disabled}
              aria-label={ariaLabelFor ? ariaLabelFor(day, count) : undefined}
              className={`h-14 sm:h-20 rounded-lg p-1.5 flex flex-col justify-between border text-left transition-colors ${
                disabled ? 'bg-nexus-background border-nexus-border opacity-50 cursor-default'
                  : isSelected ? 'border-nexus-primary bg-nexus-primary-soft/50 cursor-pointer' : 'bg-nexus-background border-nexus-border hover:border-nexus-primary cursor-pointer'
              }`}
            >
              <span className="text-xs sm:text-sm font-semibold text-nexus-text-secondary nx-num">{day.dayNum}</span>
              {count > 0 && (
                <span className="self-end min-w-6 h-5 sm:h-6 px-1.5 inline-flex items-center justify-center rounded-full bg-nexus-primary text-white text-xs font-semibold nx-num">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 12 tarjetas (Ene…Dic) con la cantidad de cada mes.
 * - countFor(monthIndex 0–11) -> número
 * - unitLabel: texto debajo del número ("Reservas", "Servicios")
 * - extraFor(monthIndex): línea opcional debajo (ej. total en Bs)
 * - onPick(monthIndex)
 * - isDisabled(monthIndex): meses sin acción (ej. futuros). Opcional.
 */
export function YearCalendar({ countFor, unitLabel, extraFor, onPick, isDisabled }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {MONTH_CARDS.map((m, idx) => {
        const disabled = !!isDisabled?.(idx);
        const extra = extraFor?.(idx);
        return (
          <button
            type="button"
            key={m}
            disabled={disabled}
            className={`bg-nexus-surface border border-nexus-border rounded-xl p-4 text-center transition-colors ${disabled ? 'opacity-50 cursor-default' : 'hover:border-nexus-primary/50 cursor-pointer'}`}
            onClick={() => onPick(idx)}
          >
            <span className="block text-sm font-semibold text-nexus-text">{m}</span>
            <span className="block text-2xl font-bold text-nexus-primary nx-num mt-2">{countFor(idx) || 0}</span>
            <span className="block text-xs text-nexus-text-muted mt-0.5">{unitLabel}</span>
            {extra != null && <span className="block text-xs font-semibold text-nexus-text nx-num mt-1">{extra}</span>}
          </button>
        );
      })}
    </div>
  );
}
