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
    <div className="min-h-screen bg-nexus-background text-nexus-text font-sans antialiased flex items-center justify-center p-4 selection:bg-nexus-primary selection:text-white">
      
      <div className="w-full max-w-sm">

        {/* ── Logo / cabecera ── */}
        <div className="flex flex-col items-center mb-8">
        <img
            src="/favicon.svg"
            alt="GallyFlow"
            className="w-12 h-12 rounded-xl shadow-md mb-4 object-contain"
          />
          <h1 className="text-base font-extrabold tracking-wider text-nexus-text">
            GallyFlow
          </h1>
          <p className="text-[10px] text-nexus-text-muted font-bold tracking-widest uppercase font-mono mt-0.5">
            Panel de Administración
          </p>
        </div>

        {/* ── Card ── */}
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-7 shadow-xl">

          <form onSubmit={handleSubmit} className="space-y-4 text-left">

            {/* ── Campo: correo ── */}
            <div>
              <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1.5 uppercase tracking-wider">
                Correo electrónico
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="w-3.5 h-3.5 text-nexus-text-muted" />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@gallyflow.com"
                  disabled={loading}
                  autoComplete="email"
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg pl-9 pr-3 py-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary transition-colors placeholder:text-nexus-text-muted disabled:opacity-50 text-left"                />
              </div>
            </div>

            {/* ── Campo: contraseña ── */}
            <div>
              <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1.5 uppercase tracking-wider">
                Contraseña
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="w-3.5 h-3.5 text-nexus-text-muted" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  autoComplete="current-password"
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg pl-9 pr-10 py-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary transition-colors font-mono placeholder:text-nexus-text-muted disabled:opacity-50 text-left"                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-nexus-text-muted hover:text-nexus-text-secondary transition-colors"
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeOff className="w-3.5 h-3.5" />
                    : <Eye    className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* ── Error ── */}
            {error && (
              <div className="bg-nexus-error-bg border border-nexus-error/25 text-nexus-error-text rounded-xl px-3.5 py-2.5 text-[11px] font-bold flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-nexus-error shrink-0" />
                {error}
              </div>
            )}

            {/* ── Botón principal ── */}
            <button
              type="button" onClick={() => onLogin(email, password)}
              disabled={!canSubmit}
              className="w-full mt-1 px-4 py-2.5 bg-nexus-primary hover:bg-nexus-primary-hover disabled:opacity-40 text-white font-extrabold rounded-lg text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
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
        <p className="text-center text-[10px] text-nexus-text-muted font-mono mt-6">
          © {new Date().getFullYear()} GallyFlow Inc.
        </p>

      </div>
    </div>
  );
}