import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppErrorBoundary from './shared/pwa/AppErrorBoundary.jsx'
import { escucharErroresDeVersion } from './shared/pwa/recargaTrasActualizacion.js'

// Tras publicar una versión nueva: recarga sola en vez de quedar en blanco.
escucharErroresDeVersion()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
