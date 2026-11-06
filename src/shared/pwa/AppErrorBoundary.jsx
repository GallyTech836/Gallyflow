import { Component } from 'react';
import { esErrorDeVersion, recargarUnaVez } from './recargaTrasActualizacion';

// Si algo falla al mostrar la app, en lugar de una pantalla en blanco se
// muestra un aviso con el botón «Recargar». Si el error es de una versión
// anterior (archivo que ya no existe), primero se recarga sola una vez.
// Estilos en línea: debe verse aunque no haya cargado el CSS de la app.
export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[AppErrorBoundary]', error);
    if (esErrorDeVersion(error)) recargarUnaVez();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100dvh', background: '#07080D', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 360, background: '#111318', border: '1px solid #262A33', borderRadius: 16, padding: 20, textAlign: 'center' }}>
          <h1 style={{ color: '#F5F5F5', fontSize: 18, fontWeight: 700, margin: 0 }}>Algo salió mal</h1>
          <p style={{ color: '#A1A1AA', fontSize: 14, margin: '6px 0 0' }}>
            Puede ser una actualización de Nexus. Recarga para continuar.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, width: '100%', height: 40, borderRadius: 10, border: 'none', background: '#F5F5F5', color: '#07080D', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
