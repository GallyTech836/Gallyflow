// fakeFirestore.js
//
// Firestore en memoria, SOLO para pruebas. Implementa lo que usa el backend:
// collection/doc/get/set/update/where/limit/runTransaction y FieldValue.
// La transacción exige "todas las lecturas antes de las escrituras", igual que
// Firestore real, para detectar errores de orden en el código.

const SENTINEL = Symbol('fieldValue');

export const FieldValue = {
  increment: (n) => ({ [SENTINEL]: 'increment', n }),
  serverTimestamp: () => ({ [SENTINEL]: 'serverTimestamp' }),
  delete: () => ({ [SENTINEL]: 'delete' }),
  arrayUnion: (...items) => ({ [SENTINEL]: 'arrayUnion', items }),
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !v[SENTINEL];
}

function applyValue(prev, value) {
  if (value && value[SENTINEL]) {
    switch (value[SENTINEL]) {
      case 'increment': return (Number(prev) || 0) + value.n;
      case 'serverTimestamp': return new Date().toISOString();
      case 'arrayUnion': return [...new Set([...(Array.isArray(prev) ? prev : []), ...value.items])];
      default: return undefined;
    }
  }
  return value;
}

function merge(prev = {}, data = {}, deep) {
  const out = { ...prev };
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) throw new Error(`Firestore no acepta undefined (campo "${k}")`);
    if (v && v[SENTINEL] === 'delete') { delete out[k]; continue; }
    if (deep && isPlainObject(v) && isPlainObject(out[k])) { out[k] = merge(out[k], v, true); continue; }
    out[k] = applyValue(out[k], v);
  }
  return out;
}

function assertNoUndefined(value, path = '') {
  if (value === undefined) throw new Error(`Firestore no acepta undefined (${path || 'raíz'})`);
  if (Array.isArray(value)) value.forEach((v, i) => assertNoUndefined(v, `${path}[${i}]`));
  else if (isPlainObject(value)) Object.entries(value).forEach(([k, v]) => assertNoUndefined(v, path ? `${path}.${k}` : k));
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export function createFakeDb(initial = {}) {
  const store = new Map();
  let autoId = 0;

  function writeNow(path, data, { merge: doMerge = false, mustExist = false } = {}) {
    if (mustExist && !store.has(path)) throw new Error(`NOT_FOUND: ${path}`);
    assertNoUndefined(data);
    const prev = doMerge || mustExist ? store.get(path) || {} : {};
    store.set(path, merge(prev, data, doMerge));
  }

  function snap(path) {
    const d = store.get(path);
    const id = path.split('/').pop();
    return { exists: d !== undefined, id, ref: docRef(path), data: () => clone(d) };
  }

  function docRef(path) {
    return {
      id: path.split('/').pop(),
      path,
      collection: (name) => colRef(`${path}/${name}`),
      get: async () => snap(path),
      set: async (data, opts = {}) => writeNow(path, data, { merge: !!opts.merge }),
      update: async (data) => writeNow(path, data, { mustExist: true }),
      delete: async () => { store.delete(path); },
    };
  }

  function matches(data, [field, op, value]) {
    const v = field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
    switch (op) {
      case '==': return v === value;
      case '!=': return v !== value;
      case '>=': return v >= value;
      case '<=': return v <= value;
      case '>': return v > value;
      case '<': return v < value;
      case 'in': return Array.isArray(value) && value.includes(v);
      case 'array-contains': return Array.isArray(v) && v.includes(value);
      default: throw new Error(`Operador no soportado en la prueba: ${op}`);
    }
  }

  function query(colPath, filters = [], max = null) {
    return {
      where: (f, op, v) => query(colPath, [...filters, [f, op, v]], max),
      limit: (n) => query(colPath, filters, n),
      orderBy: () => query(colPath, filters, max),
      get: async () => {
        const prefix = `${colPath}/`;
        let docs = [...store.keys()]
          .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
          .filter((p) => filters.every((f) => matches(store.get(p), f)))
          .map(snap);
        if (max !== null) docs = docs.slice(0, max);
        return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn) => docs.forEach(fn) };
      },
    };
  }

  function colRef(path) {
    return {
      path,
      doc: (id) => docRef(`${path}/${id ?? `auto${++autoId}`}`),
      add: async (data) => { const ref = docRef(`${path}/auto${++autoId}`); writeNow(ref.path, data); return ref; },
      ...query(path),
    };
  }

  const db = {
    collection: (name) => colRef(name),
    doc: (path) => docRef(path),
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: async (refOrQuery) => {
          if (writes.length) throw new Error('Firestore: todas las lecturas deben ir antes de las escrituras en una transacción.');
          return refOrQuery.get();
        },
        set: (ref, data, opts = {}) => { writes.push(() => writeNow(ref.path, data, { merge: !!opts.merge })); return tx; },
        update: (ref, data) => { writes.push(() => writeNow(ref.path, data, { mustExist: true })); return tx; },
        delete: (ref) => { writes.push(() => store.delete(ref.path)); return tx; },
      };
      const result = await fn(tx);
      writes.forEach((w) => w());
      return result;
    },
    // Ayudas para las pruebas
    _get: (path) => clone(store.get(path)),
    _set: (path, data) => store.set(path, clone(data)),
    _clear: () => store.clear(),
    _list: (colPath) => [...store.keys()].filter((p) => p.startsWith(`${colPath}/`) && !p.slice(colPath.length + 1).includes('/')).map((p) => ({ id: p.split('/').pop(), ...clone(store.get(p)) })),
  };

  for (const [path, data] of Object.entries(initial)) db._set(path, data);
  return db;
}
