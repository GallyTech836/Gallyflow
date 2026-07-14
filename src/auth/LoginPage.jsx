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
    <div className="min-h-screen bg-[#07080D] text-[#E2E8F0] font-sans antialiased flex items-center justify-center p-4 selection:bg-indigo-500 selection:text-white">
      
      <div className="w-full max-w-sm">

        {/* ── Logo / cabecera ── */}
        <div className="flex flex-col items-center mb-8">
        <img
            src="/favicon.svg"
            alt="GallyFlow"
            className="w-12 h-12 rounded-xl shadow-lg shadow-indigo-950/40 mb-4 object-contain"
          />
          <h1 className="text-base font-extrabold tracking-wider bg-gradient-to-r from-white via-slate-200 to-indigo-400 bg-clip-text text-transparent">
            GallyFlow
          </h1>
          <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase font-mono mt-0.5">
            Panel de Administración
          </p>
        </div>

        {/* ── Card ── */}
        <div className="bg-[#0C0E17] border border-[#1B2136] rounded-2xl p-7 shadow-2xl shadow-black/40">

          <form onSubmit={handleSubmit} className="space-y-4 text-left">

            {/* ── Campo: correo ── */}
            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wider">
                Correo electrónico
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@gallyflow.com"
                  disabled={loading}
                  autoComplete="email"
                  className="w-full bg-[#131728] border border-[#1E2442] rounded-lg pl-9 pr-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600 disabled:opacity-50 text-left"                />
              </div>
            </div>

            {/* ── Campo: contraseña ── */}
            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1.5 uppercase tracking-wider">
                Contraseña
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  autoComplete="current-password"
                  className="w-full bg-[#131728] border border-[#1E2442] rounded-lg pl-9 pr-10 py-2.5 text-xs text-white outline-none focus:border-indigo-500 transition-colors font-mono placeholder:text-slate-600 disabled:opacity-50 text-left"                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
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
              <div className="bg-[#1F0E13] border border-red-500/25 text-red-300 rounded-xl px-3.5 py-2.5 text-[11px] font-bold flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                {error}
              </div>
            )}

            {/* ── Botón principal ── */}
            <button
              type="button" onClick={() => onLogin(email, password)}
              disabled={!canSubmit}
              className="w-full mt-1 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-700 hover:from-indigo-400 hover:to-indigo-600 disabled:from-indigo-500/40 disabled:to-indigo-700/40 text-white font-extrabold rounded-lg text-xs shadow-md shadow-indigo-950/30 transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed"
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
        <p className="text-center text-[10px] text-slate-600 font-mono mt-6">
          © {new Date().getFullYear()} GallyFlow Inc.
        </p>

      </div>
    </div>
  );
}