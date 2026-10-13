import { lazy } from 'react';

// Apps de cada vertical (businessProfileModel -> VERTICALS).
// 'citas' no está aquí: usa AdminApp / BarberApp / ClienteApp de siempre.
// Cada vertical se descarga solo cuando un negocio de ese tipo la abre.
export const VERTICAL_ADMIN_APPS = {
  restaurante: lazy(() => import('./restaurante/admin/RestauranteAdminApp')),
};
