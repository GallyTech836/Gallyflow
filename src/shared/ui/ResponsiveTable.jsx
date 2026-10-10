/**
 * Tabla en escritorio y tarjetas en celular, con la MISMA información y acciones.
 *
 * columns: [{ key, header, render?(row), align?: 'left'|'right'|'center',
 *             primary?: true  // título de la tarjeta en celular
 *             className? }]
 * actions?(row): botones de la fila (se muestran en ambas vistas).
 * onRowClick?(row): fila/tarjeta clickeable.
 * breakpoint: desde qué ancho se usa la tabla ('md' por defecto).
 * mobileActions: 'top' (junto al título, para íconos) o 'bottom' (debajo, a lo
 *   ancho, para botones con texto). Solo afecta a las tarjetas de celular.
 */
const SHOW = { sm: ['hidden sm:block', 'sm:hidden'], md: ['hidden md:block', 'md:hidden'], lg: ['hidden lg:block', 'lg:hidden'] };
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };

export default function ResponsiveTable({
  columns = [],
  rows = [],
  rowKey = (r) => r.id,
  actions = null,
  onRowClick = null,
  empty = null,
  breakpoint = 'md',
  mobileActions = 'top',
  className = '',
}) {
  const [desktopCls, mobileCls] = SHOW[breakpoint] || SHOW.md;
  const cell = (col, row) => (col.render ? col.render(row) : row[col.key]);
  const primary = columns.find((c) => c.primary) || columns[0];
  const others = columns.filter((c) => c !== primary);

  if (!rows.length && empty) return empty;

  return (
    <div className={className}>
      {/* Escritorio */}
      <div className={`${desktopCls} overflow-x-auto rounded-xl border border-nexus-border bg-nexus-surface`}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-nexus-border bg-nexus-background">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-4 py-3 text-xs font-semibold text-nexus-text-secondary ${ALIGN[c.align] || ''}`}>{c.header}</th>
              ))}
              {actions && <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-nexus-text-secondary">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-nexus-border">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`text-nexus-text ${onRowClick ? 'cursor-pointer hover:bg-nexus-surface-hover' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 align-middle ${ALIGN[c.align] || ''} ${c.className || ''}`}>{cell(c, row)}</td>
                ))}
                {actions && (
                  <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular */}
      <ul className={`${mobileCls} space-y-2`}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`rounded-xl border border-nexus-border bg-nexus-surface p-4 ${onRowClick ? 'cursor-pointer active:bg-nexus-surface-hover' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 font-semibold text-nexus-text">{cell(primary, row)}</div>
              {actions && mobileActions !== 'bottom' && (
                <div className="-mr-2 -mt-2 flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>{actions(row)}</div>
              )}
            </div>
            {others.length > 0 && (
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {others.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-xs text-nexus-text-muted">{c.header}</dt>
                    <dd className="truncate text-nexus-text">{cell(c, row) ?? '—'}</dd>
                  </div>
                ))}
              </dl>
            )}
            {actions && mobileActions === 'bottom' && (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-nexus-border pt-3 [&>*]:flex-1 sm:[&>*]:flex-none" onClick={(e) => e.stopPropagation()}>{actions(row)}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
