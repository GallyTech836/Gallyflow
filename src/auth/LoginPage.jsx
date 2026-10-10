// src/auth/LoginPage.jsx
import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';

export default function LoginPage({ onLogin, error, loading }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    onLogin(email, password);
  }

  const canSubmit = !loading && email.trim() !== '' && password !== '';

  return (
    <div className="min-h-[100dvh] bg-nexus-background text-nexus-text font-sans antialiased flex items-center justify-center p-4 selection:bg-nexus-primary selection:text-white">
      
      <div className="w-full max-w-sm">

        {/* ── Logo / cabecera ── */}
        <div className="flex flex-col items-center mb-7">
          <img
            src="/favicon.svg"
            alt=""
            className="w-14 h-14 rounded-2xl shadow-md mb-4 object-contain"
          />
          <h1 className="text-2xl font-bold tracking-tight text-nexus-text">
            Nexus
          </h1>
          <p className="text-sm text-nexus-text-secondary mt-1">
            Panel de administración
          </p>
        </div>

        {/* ── Card ── */}
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5 sm:p-7 shadow-[var(--nx-shadow-lg)]">

          <form onSubmit={handleSubmit} className="space-y-4 text-left">

            {/* ── Campo: correo ── */}
            <div>
              <label htmlFor="admin-login-email" className="text-sm font-medium text-nexus-text-secondary block mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="w-4 h-4 text-nexus-text-muted" />
                </span>
                <input
                  id="admin-login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@tunegocio.com"
                  disabled={loading}
                  autoComplete="email"
                  inputMode="email"
                  className="w-full h-11 bg-nexus-background border border-nexus-border rounded-lg pl-10 pr-3 text-base sm:text-sm text-nexus-text outline-none focus:border-nexus-primary focus:ring-2 focus:ring-nexus-primary/20 transition-colors placeholder:text-nexus-text-muted disabled:opacity-50 text-left"
                />
              </div>
            </div>

            {/* ── Campo: contraseña ── */}
            <div>
              <label htmlFor="admin-login-password" className="text-sm font-medium text-nexus-text-secondary block mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="w-4 h-4 text-nexus-text-muted" />
                </span>
                <input
                  id="admin-login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  autoComplete="current-password"
                  className="w-full h-11 bg-nexus-background border border-nexus-border rounded-lg pl-10 pr-12 text-base sm:text-sm text-nexus-text outline-none focus:border-nexus-primary focus:ring-2 focus:ring-nexus-primary/20 transition-colors placeholder:text-nexus-text-muted disabled:opacity-50 text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-nexus-text-muted hover:text-nexus-text-secondary transition-colors cursor-pointer"
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye    className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* ── Error ── */}
            {error && (
              <div role="alert" className="bg-nexus-error-bg border border-nexus-error/25 text-nexus-error-text rounded-lg px-3.5 py-2.5 text-sm font-medium flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-nexus-error shrink-0" />
                {error}
              </div>
            )}

            {/* ── Botón principal ── */}
            <button
              type="button" onClick={() => onLogin(email, password)}
              disabled={!canSubmit}
              className="w-full h-11 mt-1 px-4 bg-nexus-primary hover:bg-nexus-primary-hover disabled:opacity-50 text-white font-semibold rounded-lg text-base sm:text-sm shadow-sm transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path  className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Verificando…
                </>
              ) : (
                'Iniciar sesión'
              )}
            </button>

          </form>
        </div>

        {/* ── Footer ── */}
        <p className="text-center text-xs text-nexus-text-muted mt-6">
          © {new Date().getFullYear()} Nexus
        </p>

      </div>
    </div>
  );
}
