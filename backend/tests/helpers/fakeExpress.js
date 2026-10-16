// fakeExpress.js
//
// Router de Express mínimo, SOLO para pruebas: guarda las rutas y permite
// ejecutar la cadena de middlewares + handler con un req/res de mentira.

export function createFakeRouter() {
    const routes = [];
    const add = (method) => (path, ...handlers) => { routes.push({ method, path, handlers }); };
    const router = {
      get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE'),
      use: () => router,
      routes,
    };
    return router;
  }
  
  function matchPath(pattern, path) {
    const p = pattern.split('/');
    const a = path.split('/');
    if (p.length !== a.length) return null;
    const params = {};
    for (let i = 0; i < p.length; i++) {
      if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
      else if (p[i] !== a[i]) return null;
    }
    return params;
  }
  
  /** Ejecuta la ruta. Devuelve { status, body }. */
  export async function runRoute(router, method, path, { body = {}, query = {}, headers = {}, actor = null } = {}) {
    const route = router.routes.find((r) => r.method === method && matchPath(r.path, path));
    if (!route) throw new Error(`Ruta no encontrada en la prueba: ${method} ${path}`);
    const req = {
      method, path, body, query, params: matchPath(route.path, path), actor,
      get: (h) => headers[String(h).toLowerCase()],
    };
    const out = { status: 200, body: undefined, headers: {} };
    const res = {
      status(code) { out.status = code; return res; },
      json(data) { out.body = data; return res; },
      sendStatus(code) { out.status = code; return res; },
      set(k, v) { out.headers[k] = v; return res; },
    };
    for (const h of route.handlers) {
      let siguio = false;
      await h(req, res, () => { siguio = true; });
      if (!siguio) break;
    }
    return out;
  }
  