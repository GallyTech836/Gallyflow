import React, { useState, useEffect, useRef } from 'react';
import { LayoutTemplate, Save, Loader as Loader2, Star } from 'lucide-react';
import { useHeroConfig } from '../../../shared/heroConfig/useHeroConfig';
import { saveHeroConfig } from './businessHeroService';
import BusinessHeroPreview from './BusinessHeroPreview';
import HeroLogoUploader from './HeroLogoUploader';

const inputClass =
  'w-full bg-[#0A0D1A] border border-[#232B4C] text-white rounded-lg text-xs px-3 py-2.5 outline-none focus:border-indigo-500/70 transition-colors placeholder:text-slate-600';

function SectionCard({ children, className = '' }) {
  return (
    <div className={`bg-[#0C0E17] border border-[#1E2442] rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <span className="block text-[10px] text-slate-500 uppercase tracking-widest font-mono mb-1.5">
      {children}
    </span>
  );
}

export default function BusinessHeroSettings({ negocioId }) {
  const { heroConfig, loading } = useHeroConfig(negocioId);
  const [form, setForm] = useState(heroConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  const seededRef = useRef(false);
  useEffect(() => {
    if (!loading && !seededRef.current) {
      setForm(heroConfig);
      seededRef.current = true;
    }
  }, [loading, heroConfig]);

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!negocioId || saving || logoUploading) return;
    setSaving(true);
    try {
      const clean = await saveHeroConfig(negocioId, form);
      setForm(clean);
      setSaved(true);
    } catch (err) {
      console.error('Error al guardar la pantalla de bienvenida:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* ── Encabezado ──────────────────────────────────────────── */}
      <SectionCard>
        <div className="flex items-center gap-2.5 mb-0.5">
          <LayoutTemplate className="w-4 h-4 text-indigo-400 shrink-0" />
          <h3 className="text-sm font-bold text-white">Pantalla de Bienvenida</h3>
        </div>
        <p className="text-[11px] text-slate-500 ml-6.5">
          Personaliza lo que tus clientes ven antes de reservar una cita.
        </p>
      </SectionCard>

      {/* ── Fila 1: Nombre + Eslogan ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SectionCard>
          <FieldLabel>Nombre del negocio</FieldLabel>
          <input
            type="text"
            value={form.businessName}
            onChange={(e) => update('businessName', e.target.value)}
            className={inputClass}
            placeholder="GallyFlow"
          />
        </SectionCard>

        <SectionCard>
          <FieldLabel>Eslogan</FieldLabel>
          <input
            type="text"
            value={form.slogan}
            onChange={(e) => update('slogan', e.target.value)}
            className={inputClass}
            placeholder="Tu estilo comienza aquí"
          />
        </SectionCard>
      </div>

      {/* ── Fila 2: Logo + Portada ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SectionCard>
          <FieldLabel>Logo del negocio</FieldLabel>
          <HeroLogoUploader
            value={form.logo}
            onChange={(url) => update('logo', url)}
            onUploadingChange={setLogoUploading}
          />
        </SectionCard>

        <SectionCard>
          <FieldLabel>Imagen de portada (próximamente)</FieldLabel>
          {/* Placeholder visual idéntico al uploader pero sin funcionalidad */}
          <div className="flex items-center gap-4 bg-[#0A0D1A] border border-dashed border-[#232B4A] rounded-xl p-4 opacity-50 select-none cursor-not-allowed min-h-[88px]">
            <div className="w-14 h-14 rounded-xl bg-[#131728] border border-[#232343] flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500">Subir imagen de portada</p>
              <p className="text-[10px] text-slate-600 mt-0.5">Solo se mostrará en futuras versiones</p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Fila 3: Rating toggle + valor ───────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Toggle */}
        <SectionCard>
          <FieldLabel>Mostrar calificación</FieldLabel>
          <div className="flex items-center justify-between mt-1">
            <div>
              <p className="text-xs font-semibold text-slate-200 leading-tight">Activa esta opción</p>
              <p className="text-[10px] text-slate-500 mt-0.5">para mostrar estrellas y rating.</p>
            </div>
            <button
              type="button"
              onClick={() => update('showRating', !form.showRating)}
              className={`w-11 h-6 rounded-full transition-colors relative shrink-0 overflow-hidden ${
                form.showRating ? 'bg-indigo-500' : 'bg-[#2A3153]'
              }`}
              aria-pressed={form.showRating}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  form.showRating ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </SectionCard>

        {/* Valor del rating */}
        <SectionCard>
          <FieldLabel>Rating</FieldLabel>
          <p className="text-[10px] text-slate-500 mb-2">Calificación que verán tus clientes.</p>
          <div className={`flex items-center gap-2 bg-[#0A0D1A] border border-[#232B4C] rounded-lg px-3 py-2 ${!form.showRating ? 'opacity-40 pointer-events-none' : ''}`}>
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
            <input
              type="number"
              min="0"
              max="5"
              step="0.1"
              disabled={!form.showRating}
              value={form.rating}
              onChange={(e) => update('rating', parseFloat(e.target.value))}
              className="flex-1 bg-transparent text-white text-xs font-bold outline-none disabled:cursor-not-allowed w-full"
            />
          </div>
        </SectionCard>
      </div>

      {/* ── Texto secundario (full width) ───────────────────────── */}
      <SectionCard>
        <FieldLabel>Texto secundario (opcional)</FieldLabel>
        <p className="text-[10px] text-slate-500 mb-2">Texto corto que aparecerá debajo del rating.</p>
        <div className="relative">
          <input
            type="text"
            value={form.highlightText}
            onChange={(e) => {
              if (e.target.value.length <= 40) update('highlightText', e.target.value);
            }}
            className={inputClass}
            placeholder="⚡ Reserva en 1 minuto"
            maxLength={40}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-slate-600 font-mono pointer-events-none">
            {form.highlightText?.length ?? 0}/40
          </span>
        </div>
      </SectionCard>

      {/* ── Vista Previa (full width) ────────────────────────────── */}
      <BusinessHeroPreview config={form} />

      {/* ── Botón Guardar (fijo al final) ───────────────────────── */}
      <div className="sticky bottom-0 pb-1 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || logoUploading || !negocioId}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-extrabold uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)]"
        >
          {saving
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Save className="w-3.5 h-3.5" />}
          {saving
            ? 'Guardando...'
            : logoUploading
              ? 'Esperando logo...'
              : saved
                ? 'Guardado ✓'
                : 'Guardar cambios'}
        </button>
      </div>

    </div>
  );
}
