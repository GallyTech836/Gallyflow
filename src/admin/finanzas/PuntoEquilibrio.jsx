// PuntoEquilibrio.jsx — Analítica: cuánto hay que vender este mes para cubrir
// los gastos fijos (los que se repiten cada mes en Finanzas › Gastos).
// Meta = gastos fijos ÷ lo que queda de cada venta después de comisiones y
// otros gastos. Lo calcula el backend (/api/finanzas/equilibrio).

import { useEffect, useState } from 'react';
import { Card, Badge, Button } from '../../shared/ui';
import { bs } from './finanzasFormat';
import { getEquilibrio } from './finanzasApi';

export default function PuntoEquilibrio({ financeToken = null, onFinanceExpired, onOpenFinanzas }) {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [showCalc, setShowCalc] = useState(false);

  useEffect(() => {
    let vivo = true;
    getEquilibrio(financeToken).then((r) => {
      if (!vivo) return;
      if (r.status === 401) { onFinanceExpired?.(); return; }
      if (!r.ok) { setHidden(true); return; } // sin backend nuevo o sin permiso: no se muestra
      setData(r.data);
    });
    return () => { vivo = false; };
  }, [financeToken, onFinanceExpired]);

  if (hidden) return null;

  const header = (badge) => (
    <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-nexus-text">Punto de equilibrio</h3>
        <p className="text-sm text-nexus-text-secondary">Lo que tienes que vender en el mes para no perder.</p>
      </div>
      {badge}
    </div>
  );

  if (!data) {
    return <Card>{header(null)}<div className="mt-3 h-16 animate-pulse rounded-lg bg-nexus-surface-hover" /></Card>;
  }

  if (!(data.fijos > 0)) {
    return (
      <Card>
        {header(null)}
        <p className="mt-2 text-sm text-nexus-text-secondary">Registra en Finanzas › Gastos los gastos que se repiten cada mes (alquiler, sueldos, internet…) y aquí verás cuánto tienes que vender para cubrirlos.</p>
        {onOpenFinanzas && <Button variant="secondary" size="sm" className="mt-3" onClick={onOpenFinanzas}>Ir a Gastos</Button>}
      </Card>
    );
  }

  const { vendido, meta, fijos, ratio, cubierto, daysLeft } = data;
  const sinMargen = meta === null;
  const escala = Math.max(meta ? meta * 1.2 : 0, vendido, 1);
  const fillW = Math.min(100, (vendido / escala) * 100);
  const markL = meta ? Math.min(100, (meta / escala) * 100) : null;
  const falta = meta ? Math.max(0, meta - vendido) : 0;
  const per100 = ratio !== null ? (ratio * 100).toFixed(2).replace('.', ',') : null;
  const usoMesPasado = vendido === 0 && ratio !== null;

  let estado;
  if (sinMargen) {
    estado = ratio === null
      ? <p className="text-sm text-nexus-text-secondary">Todavía no hay ventas este mes para calcularlo.</p>
      : <p className="text-sm font-semibold text-nexus-error-text">Con lo que queda de cada venta no alcanzas a cubrir los fijos.</p>;
  } else if (cubierto) {
    estado = <p className="text-sm font-semibold text-nexus-success-text">Ya cubriste los gastos fijos. Desde aquí empiezas a ganar.</p>;
  } else {
    estado = <p className="text-sm text-nexus-text">Te faltan <b className="nx-num">{bs(falta)}</b> para cubrir los gastos del mes.</p>;
  }

  const badge = cubierto
    ? <Badge tone="success">Cubierto</Badge>
    : <Badge>{daysLeft > 0 ? `Quedan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}` : 'Último día'}</Badge>;

  return (
    <Card>
      {header(badge)}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-nexus-text-secondary">Vendido</p>
          <p className="nx-num text-3xl font-bold text-nexus-text">{bs(vendido)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-nexus-text-secondary">Meta del mes</p>
          <p className="nx-num text-3xl font-bold text-nexus-text-muted">{meta ? bs(meta) : '—'}</p>
          <p className="text-xs text-nexus-text-secondary">Gastos fijos {bs(fijos)}</p>
        </div>
      </div>
      <div
        className="relative mt-3 h-3 rounded-full bg-nexus-surface-hover"
        role="img"
        aria-label={meta ? `Vendido ${bs(vendido)} de una meta de ${bs(meta)}` : `Vendido ${bs(vendido)}`}
      >
        <div className={`h-full rounded-full ${cubierto ? 'bg-nexus-success' : 'bg-nexus-primary'}`} style={{ width: `${fillW}%` }} />
        {markL !== null && <div className="absolute -top-1 h-5 w-0.5 rounded bg-nexus-text" style={{ left: `calc(${markL}% - 1px)` }} aria-hidden="true" />}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {estado}
        {ratio !== null && (
          <button type="button" className="text-sm font-medium text-nexus-text underline underline-offset-2 cursor-pointer" onClick={() => setShowCalc(!showCalc)} aria-expanded={showCalc}>
            {showCalc ? 'Ocultar' : '¿Cómo se calcula?'}
          </button>
        )}
      </div>
      {showCalc && ratio !== null && (
        <div className="mt-3 flex max-w-md flex-col gap-1.5 rounded-lg border border-nexus-border bg-nexus-background p-3 text-sm">
          <div className="flex justify-between gap-3"><span className="text-nexus-text-secondary">Gastos fijos del mes</span><span className="nx-num font-semibold text-nexus-text">{bs(fijos)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-nexus-text-secondary">De cada Bs 100 vendidos te quedan</span><span className="nx-num font-semibold text-nexus-text">Bs {per100}</span></div>
          {meta && (
            <div className="flex justify-between gap-3 border-t border-nexus-border pt-1.5"><span className="font-semibold text-nexus-text">Meta ({bs(fijos)} ÷ {ratio.toFixed(3).replace('.', ',')})</span><span className="nx-num font-semibold text-nexus-text">{bs(meta)}</span></div>
          )}
          <p className="text-xs text-nexus-text-muted">Fijos = los gastos que se repiten cada mes. Lo que queda de cada venta es después de comisiones y otros gastos.{usoMesPasado ? ' Como este mes todavía no hay ventas, se usa lo del mes pasado.' : ''}</p>
        </div>
      )}
    </Card>
  );
}
