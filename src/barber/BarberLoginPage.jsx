import React, { useState } from 'react';

export default function BarberLoginPage({ onLogin, error, loading }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    onLogin(username, password);
  }

  return (
    <div className="min-h-[100dvh] bg-nexus-background flex items-center justify-center px-4">

      {/* Glow ambiental */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-nexus-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">

        {/* Logo / marca */}
        <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-nexus-primary-soft border border-nexus-primary/20 mb-4">
            <img
              src="/favicon.svg"
              alt=""
              className="w-9 h-9 rounded-lg object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-nexus-text tracking-tight">
            Nexus <span className="text-nexus-primary">Staff</span>
          </h1>
          <p className="text-sm text-nexus-text-secondary mt-1">
            Acceso para profesionales
          </p>
        </div>

        {/* Card */}
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5 sm:p-6 shadow-[var(--nx-shadow-lg)]">

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Usuario */}
            <div className="space-y-1.5">
              <label htmlFor="barber-login-user" className="block text-sm font-medium text-nexus-text-secondary">
                Usuario
              </label>
              <input
                id="barber-login-user"
                autoCapitalize="none"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="tu.usuario"
                autoComplete="username"
                className="w-full h-11 bg-nexus-background border border-nexus-border focus:border-nexus-primary focus:ring-2 focus:ring-nexus-primary/20 rounded-lg px-4 text-base sm:text-sm text-nexus-text placeholder-nexus-text-muted outline-none transition-colors"
              />
            </div>

            {/* Contraseña */}
            <div className="space-y-1.5">
              <label htmlFor="barber-login-password" className="block text-sm font-medium text-nexus-text-secondary">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="barber-login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full h-11 bg-nexus-background border border-nexus-border focus:border-nexus-primary focus:ring-2 focus:ring-nexus-primary/20 rounded-lg px-4 pr-12 text-base sm:text-sm text-nexus-text placeholder-nexus-text-muted outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-nexus-text-muted hover:text-nexus-text-secondary transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div role="alert" className="flex items-center gap-2 bg-nexus-error-bg border border-nexus-error/20 rounded-lg px-3 py-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-nexus-error shrink-0" />
                <p className="text-sm text-nexus-error-text font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="w-full h-11 bg-nexus-primary hover:bg-nexus-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-base sm:text-sm rounded-lg transition-colors shadow-sm mt-2 cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Verificando...
                </span>
              ) : (
                'Ingresar'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-nexus-text-muted mt-5">
          Nexus · Plataforma Staff
        </p>
      </div>
    </div>
  );
}