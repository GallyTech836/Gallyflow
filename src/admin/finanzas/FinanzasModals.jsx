// Ventanas de Finanzas: pregunta inicial, cuenta (nueva / editar) y depósito del sobre.
// Toda escritura va al backend con un requestId fijo por ventana abierta:
// un doble clic o un reintento no duplica nada.

import { useMemo, useRef, useState } from 'react';
import { Modal, Button, Field, Input, ChoiceChips } from '../../shared/ui';
import { bs, bs2, parseAmount, TYPE_OPTIONS } from './finanzasFormat';
import { newRequestId, setupFinanzas, createCuenta, updateCuenta, createTransferencia, createGasto, payGasto } from './finanzasApi';

function useRequestId() {
  const ref = useRef(null);
  if (!ref.current) ref.current = newRequestId();
  return ref.current;
}

const ErrorText = ({ children }) => (children ? <p role="alert" className="text-sm text-nexus-error-text">{children}</p> : null);

/** Botones que se marcan y desmarcan (varios a la vez). */
function ToggleChips({ options, values, onToggle, label }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={`inline-flex h-10 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors cursor-pointer ${on
              ? 'border-nexus-primary bg-nexus-primary text-white'
              : 'border-nexus-border bg-nexus-surface text-nexus-text hover:bg-nexus-surface-hover'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Responde la llamada: error de PIN vencido, error de mensaje o datos. */
async function run(promise, { onExpired, setError }) {
  const r = await promise;
  if (r.status === 401) { onExpired?.(); return null; }
  if (!r.ok) { setError(r.data?.error || 'No se pudo guardar. Intenta de nuevo.'); return null; }
  return r.data;
}

// ───────────────────────── Pregunta inicial ─────────────────────────

export function SetupModal({ estado, token, onExpired, onDone, onLater }) {
  const requestId = useRequestId();
  const metodos = (estado?.methods || []).filter((m) => !m.isCash);
  const cajas = estado?.cajas || [];
  const [cuentas, setCuentas] = useState([{ tempId: 'n1', name: '', balance: '' }]);
  // Con una sola cuenta, todos los cobros van ahí de entrada (se puede cambiar).
  const [map, setMap] = useState(() => Object.fromEntries(metodos.map((m) => [m.name, 'n1'])));
  const [error, setError] = useState('');

  const opciones = cuentas.map((c, i) => ({ value: c.tempId, label: c.name.trim() || `Cuenta ${i + 1}` }));
  const setCuenta = (tempId, patch) => setCuentas((cs) => cs.map((c) => (c.tempId === tempId ? { ...c, ...patch } : c)));
  const agregar = () => setCuentas((cs) => [...cs, { tempId: `n${Date.now()}`, name: '', balance: '' }]);
  const quitar = (tempId) => {
    setCuentas((cs) => cs.filter((c) => c.tempId !== tempId));
    setMap((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== tempId)));
  };

  const guardar = async () => {
    setError('');
    const usadas = cuentas.filter((c) => Object.values(map).includes(c.tempId));
    const faltan = metodos.filter((m) => !map[m.name]);
    if (faltan.length) return setError(`Falta elegir a dónde llega ${faltan.map((m) => m.name).join(', ')}.`);
    for (const c of usadas) {
      if (c.name.trim().length < 2) return setError('Ponle nombre a cada cuenta.');
      if (Number.isNaN(parseAmount(c.balance)) || parseAmount(c.balance) < 0) return setError(`Escribe cuánto hay hoy en ${c.name.trim()} (puede ser 0).`);
    }
    const data = await run(setupFinanzas(token, {
      requestId,
      newAccounts: usadas.map((c) => ({ tempId: c.tempId, name: c.name.trim(), type: 'banco', balance: parseAmount(c.balance) })),
      map,
    }), { onExpired, setError });
    if (data) onDone(data);
  };

  return (
    <Modal
      title="¿A dónde llega lo que cobras?"
      description="Lo puedes cambiar después."
      size="lg"
      onClose={onLater}
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onLater}>Más tarde</Button>
          <Button onClick={guardar}>Listo</Button>
        </div>
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-nexus-border bg-nexus-background p-3">
          <p className="text-sm font-semibold text-nexus-text">Efectivo</p>
          <p className="text-sm text-nexus-text-secondary">
            Va a la caja de cada sucursal.
            {cajas.length > 0 && ` Hoy: ${cajas.map((c) => `${c.name} ${bs(c.balance)}`).join(' · ')}.`}
          </p>
        </div>

        {metodos.length > 0 && (
          <>
            <div className="rounded-lg border border-nexus-border p-3">
              <p className="mb-2 text-sm font-semibold text-nexus-text">Tus cuentas</p>
              <div className="flex flex-col gap-3">
                {cuentas.map((c, i) => (
                  <div key={c.tempId} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px_auto] sm:items-end">
                    <Field label="Nombre"><Input value={c.name} placeholder="Ej.: Banco Unión" maxLength={60} onChange={(e) => setCuenta(c.tempId, { name: e.target.value })} /></Field>
                    <Field label="¿Cuánto hay hoy? (Bs)"><Input type="number" inputMode="decimal" min="0" value={c.balance} placeholder="0" onChange={(e) => setCuenta(c.tempId, { balance: e.target.value })} /></Field>
                    {cuentas.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => quitar(c.tempId)} aria-label={`Quitar ${c.name || `cuenta ${i + 1}`}`}>Quitar</Button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-2" onClick={agregar}>+ Otra cuenta</Button>
            </div>

            {metodos.map((m) => (
              <div key={m.key} className="rounded-lg border border-nexus-border p-3">
                <p className="mb-2 text-sm font-semibold text-nexus-text">¿A dónde llega {m.name}?</p>
                <ChoiceChips label={`A dónde llega ${m.name}`} options={opciones} value={map[m.name] || null} onChange={(v) => setMap((x) => ({ ...x, [m.name]: v }))} />
              </div>
            ))}
          </>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

// ───────────────────────── Cuenta nueva / editar ─────────────────────────

export function AccountModal({ account, estado, token, onExpired, onClose, onSaved }) {
  const requestId = useRequestId();
  const isEdit = !!account;
  const isCaja = !!account?.isCaja;
  const metodos = useMemo(() => (estado?.methods || []).filter((m) => !m.isCash), [estado]);
  const otraCuenta = useMemo(() => {
    const names = Object.fromEntries((estado?.accounts || []).map((a) => [a.id, a.name]));
    return Object.fromEntries(metodos.map((m) => [m.key, m.accountId && m.accountId !== account?.id ? names[m.accountId] : null]));
  }, [estado, metodos, account]);

  const [name, setName] = useState(account?.name || '');
  const [type, setType] = useState(account?.type && account.type !== 'efectivo' ? account.type : 'banco');
  const [balance, setBalance] = useState(isEdit ? String(account.balance) : '');
  const [methods, setMethods] = useState(account?.methodKeys || []);
  const [active, setActive] = useState(account ? account.active : true);
  const [error, setError] = useState('');

  const toggle = (k) => setMethods((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));
  const movidos = methods.filter((k) => otraCuenta[k]).map((k) => `${metodos.find((m) => m.key === k)?.name} (estaba en ${otraCuenta[k]})`);

  const guardar = async () => {
    setError('');
    if (!isCaja && name.trim().length < 2) return setError('Ponle un nombre a la cuenta.');
    const saldo = parseAmount(balance);
    if (Number.isNaN(saldo) || saldo < 0) return setError(isEdit ? 'Escribe el saldo (puede ser 0).' : 'Escribe cuánto hay hoy en la cuenta (puede ser 0).');
    let data;
    if (!isEdit) {
      data = await run(createCuenta(token, { requestId, name: name.trim(), type, balance: saldo, methods }), { onExpired, setError });
    } else {
      const body = { requestId };
      if (!isCaja) { body.name = name.trim(); body.type = type; body.methods = methods; }
      if (saldo !== Math.round(account.balance * 100) / 100) body.balance = saldo;
      if (!isCaja && active !== account.active) body.active = active;
      data = await run(updateCuenta(token, account.id, body), { onExpired, setError });
    }
    if (data) onSaved(data, isEdit ? 'Cuenta guardada.' : 'Cuenta creada.');
  };

  return (
    <Modal
      title={isEdit ? `Editar ${account.name}` : 'Nueva cuenta'}
      description={isEdit ? (isCaja ? 'Efectivo de la sucursal.' : null) : 'Banco, billetera u otro.'}
      onClose={onClose}
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar}>{isEdit ? 'Guardar' : 'Crear cuenta'}</Button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        {!isCaja && (
          <>
            <Field label="Nombre"><Input value={name} placeholder="Ej.: Banco Unión" maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Tipo"><ChoiceChips label="Tipo de cuenta" options={TYPE_OPTIONS} value={type} onChange={setType} /></Field>
          </>
        )}
        <Field
          label={isEdit ? 'Saldo de hoy (Bs)' : '¿Cuánto hay hoy? (Bs)'}
          hint={isEdit ? `Nexus calcula ${bs2(account.balance)}. Si no coincide, escribe el real.` : 'Puede ser 0.'}
        >
          <Input type="number" inputMode="decimal" min="0" step="0.01" className="nx-num text-lg" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </Field>
        {!isCaja && metodos.length > 0 && (
          <Field label="¿Qué cobros llegan aquí?" hint="Cada cobro llega a una sola cuenta.">
            <ToggleChips label="Cobros que llegan aquí" options={metodos.map((m) => ({ value: m.key, label: m.name }))} values={methods} onToggle={toggle} />
          </Field>
        )}
        {movidos.length > 0 && <p className="text-xs text-nexus-text-secondary">Se mueve aquí: {movidos.join(', ')}.</p>}
        {isEdit && !isCaja && (
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-nexus-border p-3">
            <span>
              <span className="block text-sm font-semibold text-nexus-text">Cuenta activa</span>
              <span className="block text-xs text-nexus-text-secondary">Solo con saldo 0 y sin cobros.</span>
            </span>
            <input type="checkbox" className="h-5 w-5 accent-[var(--nx-primary)]" checked={active} onChange={(e) => setActive(e.target.checked)} />
          </label>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

// ───────────────────────── Depósito del sobre ─────────────────────────

export function DepositModal({ estado, token, onExpired, onClose, onSaved }) {
  const requestId = useRequestId();
  const activas = (estado?.accounts || []).filter((a) => a.active);
  const cajas = activas.filter((a) => a.isCaja);
  const bancos = activas.filter((a) => !a.isCaja);
  const [from, setFrom] = useState(cajas[0]?.id || '');
  const [to, setTo] = useState(bancos[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const caja = cajas.find((c) => c.id === from);
  const banco = bancos.find((b) => b.id === to);
  const monto = parseAmount(amount);
  const valido = !Number.isNaN(monto) && monto > 0;

  const guardar = async () => {
    setError('');
    if (!caja || !banco) return setError('Elige la caja y el banco.');
    if (!valido) return setError('Escribe un importe mayor a 0.');
    if (monto > caja.balance) return setError(`En ${caja.name} hay ${bs2(caja.balance)}.`);
    const data = await run(createTransferencia(token, { requestId, fromAccountId: caja.id, toAccountId: banco.id, amount: monto, note: 'Depósito del sobre' }), { onExpired, setError });
    if (data) onSaved(data, `Listo. ${bs(monto)} pasaron de ${caja.name} a ${banco.name}.`);
  };

  return (
    <Modal
      title="Deposité el sobre en el banco"
      description="De la caja al banco."
      onClose={onClose}
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={!bancos.length}>Guardar depósito</Button>
        </div>
      )}
    >
      {!bancos.length ? (
        <p className="text-sm text-nexus-text-secondary">Primero crea la cuenta del banco en Administrar cuentas.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {cajas.length > 1 && <Field label="¿De qué caja?"><ChoiceChips label="Caja" options={cajas.map((c) => ({ value: c.id, label: c.name }))} value={from} onChange={setFrom} /></Field>}
          {bancos.length > 1 && <Field label="¿A qué cuenta?"><ChoiceChips label="Cuenta" options={bancos.map((b) => ({ value: b.id, label: b.name }))} value={to} onChange={setTo} /></Field>}
          <Field label="¿Cuánto depositaste? (Bs)">
            <Input type="number" inputMode="decimal" min="0" step="0.01" className="nx-num text-lg" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </Field>
          {caja && banco && (
            <p className="nx-num rounded-lg border border-nexus-border bg-nexus-background p-3 text-sm text-nexus-text-secondary">
              {caja.name}: {bs2(caja.balance)} → <b className="text-nexus-text">{bs2(caja.balance - (valido ? monto : 0))}</b>
              <br />
              {banco.name}: {bs2(banco.balance)} → <b className="text-nexus-text">{bs2(banco.balance + (valido ? monto : 0))}</b>
            </p>
          )}
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </Modal>
  );
}

// ───────────────────────── Gastos ─────────────────────────

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Cuentas de donde puede salir un pago, con su saldo. */
function accountOptions(estado) {
  return (estado?.accounts || []).filter((a) => a.active).map((a) => ({ value: a.id, label: `${a.name} · ${bs(a.balance)}` }));
}

export function GastoModal({ estado, categories, token, onExpired, onClose, onSaved }) {
  const requestId = useRequestId();
  const cuentas = accountOptions(estado);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Servicios');
  const [paid, setPaid] = useState('si');
  const [accountId, setAccountId] = useState(cuentas[0]?.value || '');
  const [due, setDue] = useState(localToday());
  const [repeat, setRepeat] = useState(false);
  const [day, setDay] = useState(String(new Date().getDate()));
  const [error, setError] = useState('');

  const guardar = async () => {
    setError('');
    const monto = parseAmount(amount);
    if (!(monto > 0)) return setError('Escribe cuánto fue.');
    if (title.trim().length < 2) return setError('Escribe en qué fue el gasto.');
    if (paid === 'si' && !accountId) return setError('Elige de dónde salió la plata.');
    if (paid === 'despues' && !repeat && !due) return setError('Elige hasta cuándo tienes que pagarlo.');
    const dia = Math.floor(Number(day));
    if (repeat && !(dia >= 1 && dia <= 31)) return setError('El día de pago va del 1 al 31.');
    const data = await run(createGasto(token, {
      requestId, title: title.trim(), category, amount: monto, paidNow: paid === 'si',
      accountId: paid === 'si' ? accountId : null, due: paid === 'despues' && !repeat ? due : null, repeat, day: repeat ? dia : null,
    }), { onExpired, setError });
    if (!data) return;
    const sv = data.saved || {};
    const msg = sv.repeat
      ? `Se repetirá el día ${dia} de cada mes.`
      : sv.paidNow
        ? (sv.fromCaja ? 'Gasto guardado. Salió de la caja.' : `Gasto guardado. Salió de ${sv.account}.`)
        : 'Anotado en «Tienes que pagar».';
    onSaved(data, msg);
  };

  return (
    <Modal
      title="Registrar gasto"
      onClose={onClose}
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar}>Guardar</Button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        <Field label="¿Cuánto? (Bs)">
          <Input type="number" inputMode="decimal" min="0" step="0.01" className="nx-num text-lg" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="¿En qué?">
          <Input value={title} placeholder="Ej.: Luz del local" maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Tipo de gasto">
          <ChoiceChips label="Tipo de gasto" options={categories} value={category} onChange={setCategory} />
        </Field>
        <Field label="¿Ya lo pagaste?">
          <ChoiceChips label="¿Ya lo pagaste?" options={[{ value: 'si', label: 'Sí, ya pagué' }, { value: 'despues', label: 'Lo pago después' }]} value={paid} onChange={setPaid} />
        </Field>
        {paid === 'si' && (
          <Field label="¿De dónde salió la plata?" hint={cuentas.length ? null : 'Primero configura tus cuentas en el Resumen.'}>
            <ChoiceChips label="De dónde salió" options={cuentas} value={accountId} onChange={setAccountId} />
          </Field>
        )}
        {paid === 'despues' && !repeat && (
          <Field label="¿Hasta cuándo tienes que pagarlo?">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        )}
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-nexus-border p-3">
          <span>
            <span className="block text-sm font-semibold text-nexus-text">Se repite cada mes</span>
            <span className="block text-xs text-nexus-text-secondary">Alquiler, internet, sueldos…</span>
          </span>
          <input type="checkbox" className="h-5 w-5 accent-[var(--nx-primary)]" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
        </label>
        {repeat && (
          <Field label="Se paga el día" className="max-w-[160px]">
            <Input type="number" inputMode="numeric" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

export function PayModal({ gasto, estado, token, onExpired, onClose, onSaved }) {
  const requestId = useRequestId();
  const cuentas = accountOptions(estado);
  const sugerida = (estado?.accounts || []).find((a) => a.active && a.name === gasto.lastAccount)?.id;
  const [amount, setAmount] = useState(String(gasto.remaining));
  const [accountId, setAccountId] = useState(sugerida || cuentas[0]?.value || '');
  const [error, setError] = useState('');

  const guardar = async () => {
    setError('');
    const monto = parseAmount(amount);
    if (!(monto > 0)) return setError('Escribe cuánto pagas.');
    if (monto > gasto.remaining) return setError(`Solo faltan ${bs2(gasto.remaining)}.`);
    if (!accountId) return setError('Elige de dónde sale.');
    const data = await run(payGasto(token, gasto.id, { requestId, amount: monto, accountId }), { onExpired, setError });
    if (!data) return;
    const resto = data.saved?.remaining ?? 0;
    onSaved(data, resto > 0 ? `Quedan ${bs(resto)} por pagar.` : 'Pagado.');
  };

  return (
    <Modal
      title="Pagar"
      description={gasto.title}
      onClose={onClose}
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar}>Pagar</Button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="text-center">
          <p className="text-xs font-medium text-nexus-text-secondary">Falta pagar</p>
          <p className="nx-num text-3xl font-bold text-nexus-text">{bs(gasto.remaining)}</p>
          <p className="text-xs text-nexus-text-secondary">{whenLabel(gasto)}</p>
        </div>
        <Field label="¿Cuánto pagas ahora? (Bs)" hint="Puede ser una parte.">
          <Input type="number" inputMode="decimal" min="0" step="0.01" className="nx-num text-lg" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="¿De dónde sale?">
          <ChoiceChips label="De dónde sale" options={cuentas} value={accountId} onChange={setAccountId} />
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

/** «Vence hoy», «Vence en 5 días (20 nov)», «Venció hace 2 días». */
export function whenLabel(g) {
  const d = g.days;
  if (d === 0) return 'Vence hoy';
  if (d === 1) return 'Vence mañana';
  if (d > 0) return `Vence en ${d} días (${g.dueLabel})`;
  return `Venció hace ${-d} ${d === -1 ? 'día' : 'días'}`;
}
