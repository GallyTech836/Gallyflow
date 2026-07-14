import React from 'react';
import { Sparkles, Star, ChevronRight } from 'lucide-react';

/**
 * Landing premium de la pantalla de bienvenida: logo circular con glow,
 * nombre del negocio, eslogan, rating/texto destacado y CTA. Es la ÚNICA
 * fuente de verdad del diseño: la usa tanto ClienteApp (pantalla real,
 * antes de reservar) como BusinessHeroPreview en Admin (vista previa en
 * vivo). Si el diseño cambia, se cambia acá una sola vez.
 *
 * 100% agnóstico del rubro del negocio (barbería, spa, clínica, etc.):
 * todo el contenido viene de `config` (heroConfig), nada está hardcodeado.
 *
 * `compact`     → reduce tamaños para que quepa en el preview de Admin.
 * `onReservar`  → si se pasa, el CTA es un botón funcional (ClienteApp).
 *                 Si no se pasa, se muestra como vista previa no interactiva
 *                 (Admin), manteniendo el mismo look exacto.
 * `ctaLabel`    → texto del botón, "Reservar ahora" por defecto.
 */
export default function HeroDisplay({ config, compact = false, onReservar = null, ctaLabel = 'Reservar ahora' }) {
  const { businessName, slogan, logo, showRating, rating, highlightText } = config;

  return (
    <div className={`w-full flex flex-col items-center text-center ${compact ? 'space-y-5' : 'space-y-8'} animate-scale-up`}>

      {/* Logo circular con anillo degradado y glow, igual a la referencia */}
      <div className="relative shrink-0">
        <div
          className={`absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 blur-2xl opacity-50 ${
            compact ? 'scale-100' : 'scale-110'
          }`}
        />
        <div
          className={`relative rounded-full p-[3px] bg-gradient-to-tr from-indigo-400 via-violet-500 to-indigo-400 ${
            compact ? 'w-20 h-20' : 'w-28 h-28 sm:w-32 sm:h-32'
          }`}
        >
          <div className="w-full h-full rounded-full bg-[#0A0C16] flex items-center justify-center overflow-hidden">
            {logo ? (
              <img src={logo} alt={businessName} className="w-full h-full object-cover" />
            ) : (
              <Sparkles className="text-indigo-400" size={compact ? 26 : 40} />
            )}
          </div>
        </div>
      </div>

      {/* Nombre + separador + eslogan */}
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        <h1
          className={`${
            compact ? 'text-xl' : 'text-3xl sm:text-4xl'
          } font-extrabold text-white tracking-tight leading-tight truncate max-w-[85vw]`}
        >
          {businessName}
        </h1>
        <div className="w-10 h-[3px] mx-auto rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" />
        <p
          className={`text-slate-400 ${
            compact ? 'text-[11px]' : 'text-sm sm:text-base'
          } max-w-xs mx-auto leading-relaxed`}
        >
          {slogan}
        </p>
      </div>

      {/* Rating + texto destacado, completamente opcionales y editables */}
      {(showRating || highlightText) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {showRating && (
            <div
              className={`flex items-center gap-1.5 bg-[#111126]/60 border border-[#232343]/70 rounded-full ${
                compact ? 'px-3 py-1.5' : 'px-4 py-2.5'
              }`}
            >
              <Star size={compact ? 13 : 15} className="text-amber-400 fill-amber-400" />
              <span className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-white`}>
                {Number(rating).toFixed(1)}
              </span>
              {!compact && (
                <span className="text-[10px] text-slate-500 uppercase tracking-wider ml-0.5">Calificación</span>
              )}
            </div>
          )}

          {highlightText && (
            <div
              className={`flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/25 rounded-full ${
                compact ? 'px-3 py-1.5' : 'px-4 py-2.5'
              }`}
            >
              <span className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-indigo-300`}>
                {highlightText}
              </span>
            </div>
          )}
        </div>
      )}

      {/* CTA — botón funcional en ClienteApp, vista previa inerte en Admin */}
      <div className="w-full pt-1">
        {onReservar ? (
          <button
            type="button"
            onClick={onReservar}
            className={`w-full ${
              compact ? 'py-3 text-xs' : 'py-5 sm:py-5.5 text-sm sm:text-base'
            } px-8 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all duration-300 shadow-[0_0_30px_rgba(99,102,241,0.35)] hover:shadow-[0_0_45px_rgba(99,102,241,0.55)] active:scale-[0.97] flex items-center justify-center gap-3 transform hover:-translate-y-0.5`}
          >
            <span>{ctaLabel}</span>
            <ChevronRight size={compact ? 14 : 18} className="text-indigo-200 animate-pulse" />
          </button>
        ) : (
          <div
            className={`w-full ${
              compact ? 'py-3 text-xs' : 'py-5 text-sm'
            } px-8 bg-indigo-600/90 text-white font-black uppercase tracking-widest rounded-2xl shadow-[0_0_30px_rgba(99,102,241,0.35)] flex items-center justify-center gap-3 select-none pointer-events-none`}
          >
            <span>{ctaLabel}</span>
            <ChevronRight size={compact ? 14 : 18} className="text-indigo-200" />
          </div>
        )}
      </div>
    </div>
  );
}