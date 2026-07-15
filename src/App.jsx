import { lazy, Suspense, useEffect } from 'react';
import LoginPage from './auth/LoginPage';
import { useAuth } from './auth/useAuth';
import { useManifestByRoute } from './shared/pwa/useManifestByRoute';

const AdminApp = lazy(() => import('./admin/AdminApp'));
const BarberApp = lazy(() => import('./barber/BarberApp'));
const ClientApp = lazy(() => import('./client/ClienteApp'));

const LoadingScreen = (
  <div style={{ background: '#07080D', width: '100vw', height: '100vh' }} />
);

function App() {
  const path = window.location.pathname;
  useManifestByRoute();

  // Título de pestaña por app: BarberApp usa el suyo propio, el resto
  // conserva el título por defecto definido en index.html ("GallyFlow").
  useEffect(() => {
    if (path.startsWith('/barber')) {
      document.title = 'GallyFlow Staff';
    }
  }, [path]);

  // Ruta para la app del profesional/barbero
  if (path.startsWith('/barber')) {
    return (
      <Suspense fallback={LoadingScreen}>
        <BarberApp />
      </Suspense>
    );
  }

  if (path.startsWith('/reservar')) {
    return (
      <Suspense fallback={LoadingScreen}>
        <ClientApp />
      </Suspense>
    );
  }

  // Flujo normal del administrador
  const { user, error, loading, login } = useAuth();

  if (loading) {
    return LoadingScreen;
  }

  if (!user) {
    return <LoginPage onLogin={login} error={error} />;
  }

  return (
    <Suspense fallback={LoadingScreen}>
      <AdminApp user={user} />
    </Suspense>
  );
}

export default App;