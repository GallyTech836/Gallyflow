import { lazy, Suspense, useEffect } from 'react';
import LoginPage from './auth/LoginPage';
import { useAuth } from './auth/useAuth';
import { useManifestByRoute } from './shared/pwa/useManifestByRoute';
import { useAdminSession } from './auth/useAdminSession';
import SessionLimitScreen from './shared/session/SessionLimitScreen';
import { isAppRoute, parsePublicBookingPath } from './shared/booking/publicRoutes';

const AdminEntry = lazy(() => import('./admin/AdminEntry'));
const BarberApp = lazy(() => import('./barber/BarberApp'));
const ClientApp = lazy(() => import('./client/ClienteApp'));

const LoadingScreen = (
  <div style={{ background: '#07080D', width: '100vw', height: '100vh' }} />
);

function App() {
  const path = window.location.pathname;
  const publicBooking = parsePublicBookingPath(path);
  useManifestByRoute();

  // Título de pestaña por app: BarberApp usa el suyo propio, el resto
  // conserva el título por defecto definido en index.html ("Nexus").
  useEffect(() => {
    if (isAppRoute(path, 'barber')) {
      document.title = 'Nexus Staff';
    }
  }, [path]);

  // Ruta para la app del profesional/barbero
  if (isAppRoute(path, 'barber')) {
    return (
      <Suspense fallback={LoadingScreen}>
        <BarberApp />
      </Suspense>
    );
  }

  // Formato viejo: /reservar?negocio=slug(&pro=ID)
  if (isAppRoute(path, 'reservar')) {
    return (
      <Suspense fallback={LoadingScreen}>
        <ClientApp />
      </Suspense>
    );
  }

  // URL limpia: /slug o /slug/p/proId
  if (publicBooking) {
    return (
      <Suspense fallback={LoadingScreen}>
        <ClientApp negocioSlug={publicBooking.slug} proId={publicBooking.proId} />
      </Suspense>
    );
  }

  // Flujo normal del administrador
  const { user, error, loading, login } = useAuth();
  const adminSession = useAdminSession(user);

  if (loading || (user && (adminSession.status === 'idle' || adminSession.status === 'checking'))) {
    return LoadingScreen;
  }

  if (!user) {
    return <LoginPage onLogin={login} error={error || adminSession.message} />;
  }

  // Ya hay 2 sesiones abiertas: elegir cuál cerrar.
  if (adminSession.status === 'limit') {
    return (
      <SessionLimitScreen
        sessions={adminSession.sessions}
        onChoose={adminSession.replace}
        onCancel={adminSession.cancel}
      />
    );
  }

  return (
    <Suspense fallback={LoadingScreen}>
      <AdminEntry user={user} fallback={LoadingScreen} />
    </Suspense>
  );
}

export default App;