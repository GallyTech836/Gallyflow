import React, { useState, useEffect, useRef } from 'react';
import { LayoutTemplate, Save, Loader as Loader2, Star, Image as ImageIcon, Sparkles } from 'lucide-react';
import { useHeroConfig } from '../../../shared/heroConfig/useHeroConfig';
import { ImageUploader } from '../../../shared/ui';
import { saveHeroConfig } from './businessHeroService';
import BusinessHeroPreview from './BusinessHeroPreview';

// Link Público: lo que el cliente ve antes de reservar.
// El logo y la portada se configuran SOLO aquí; "Cuenta y plan", las
// sucursales sin foto y la página "Más información" los toman de aquí solos.

const inputClass =
  'w-full bg-nexus-background border border-nexus-border text-nexus-text rounded-lg h-10 text-base sm:text-sm px-3 outline-none focus:border-nexus-primary transition-colors placeholder:text-nexus-text-muted';

function SectionCard({ icon: Icon, title, subtitle, children, className = '' }) {
  return (
    <div className={`bg-nexus-surface border border-nexus-border rounded-xl p-4 sm:p-5 shadow-[var(--nx-shadow-sm)] ${className}`}>
      {title && (
        <div className="mb-4">
          <div className="flex items-center gap-2.5">
            {Icon && <Icon className="w-5 h-5 text-nexus-primary shrink-0" aria-hidden="true" />}
            <h3 className="text-base font-semibold text-nexus-text">{title}</h3>
          </div>
          {subtitle && <p className="mt-0.5 text-sm text-nexus-text-secondary">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

function FieldLabel({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-nexus-text-secondary mb-1.5">
      {children}
    </label>
  );
}

export default function BusinessHeroSettings({ negocioId }) {
  const { heroConfig, loading } = useHeroConfig(negocioId);
  const [form, setForm] = useState(heroConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const uploading = logoUploading || coverUploading;

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
    if (!negocioId || saving || uploading) return;
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
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">

        {/* ── Formulario ───────────────────────────────────────── */}
        <div className="space-y-4 min-w-0">
          <SectionCard
            icon={LayoutTemplate}
            title="Identidad"
            subtitle="Lo primero que ven tus clientes al abrir tu link de reservas."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel htmlFor="hero-name">Nombre del negocio</FieldLabel>
                <input
                  id="hero-name"
                  type="text"
                  value={form.businessName}
                  onChange={(e) => update('businessName', e.target.value)}
                  className={inputClass}
                  placeholder="Nombre de tu negocio"
                  maxLength={60}
                />
              </div>
              <div>
                <FieldLabel htmlFor="hero-slogan">Eslogan</FieldLabel>
                <input
                  id="hero-slogan"
                  type="text"
                  value={form.slogan}
                  onChange={(e) => update('slogan', e.target.value)}
                  className={inputClass}
                  placeholder="Tu estilo comienza aquí"
                  maxLength={140}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={ImageIcon}
            title="Logo y portada"
            subtitle="Se configuran solo aquí. Se usan automáticamente en todo Nexus."
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ImageUploader
                label="Logo"
                value={form.logo}
                onChange={(url) => update('logo', url)}
                onUploadingChange={setLogoUploading}
                maxSize={512}
                hint="Cuadrado, ideal 512×512. Pantalla de inicio y Cuenta y plan."
              />
              <ImageUploader
                label="Portada"
                shape="wide"
                value={form.cover}
                onChange={(url) => update('cover', url)}
                onUploadingChange={setCoverUploading}
                maxSize={1600}
                hint="Horizontal, ideal 1600×600. «Más información» y sucursales sin foto."
              />
            </div>
          </SectionCard>

          <SectionCard
            icon={Sparkles}
            title="Calificación y texto destacado"
            subtitle="Opcionales. Aparecen debajo del eslogan."
          >
            <div className="flex items-center justify-between gap-3 rounded-lg border border-nexus-border bg-nexus-background px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-nexus-text">Mostrar calificación</p>
                <p className="text-xs text-nexus-text-muted">Estrellas con el puntaje que elijas.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.showRating}
                aria-label="Mostrar calificación"
                onClick={() => update('showRating', !form.showRating)}
                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 overflow-hidden cursor-pointer ${
                  form.showRating ? 'bg-nexus-primary' : 'bg-nexus-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                    form.showRating ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-[10rem_minmax(0,1fr)] gap-4">
              <div className={!form.showRating ? 'opacity-40' : ''}>
                <FieldLabel htmlFor="hero-rating">Puntaje</FieldLabel>
                <div className="flex items-center gap-2 bg-nexus-background border border-nexus-border rounded-lg px-3">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" aria-hidden="true" />
                  <input
                    id="hero-rating"
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    disabled={!form.showRating}
                    value={form.rating}
                    onChange={(e) => update('rating', Math.min(5, Math.max(0, parseFloat(e.target.value) || 0)))}
                    className="flex-1 h-10 bg-transparent text-nexus-text text-base sm:text-sm font-semibold outline-none disabled:cursor-not-allowed w-full nx-num"
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="hero-highlight">Texto destacado</FieldLabel>
                <div className="relative">
                  <input
                    id="hero-highlight"
                    type="text"
                    value={form.highlightText}
                    onChange={(e) => {
                      if (e.target.value.length <= 40) update('highlightText', e.target.value);
                    }}
                    className={`${inputClass} pr-14`}
                    placeholder="⚡ Reserva en 1 minuto"
                    maxLength={40}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-nexus-text-muted nx-num pointer-events-none">
                    {form.highlightText?.length ?? 0}/40
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Vista previa (fija al costado en pantallas grandes) ─── */}
        <div className="xl:sticky xl:top-24 min-w-0">
          <BusinessHeroPreview config={form} />
        </div>
      </div>

      {/* ── Guardar ─────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-10 -mx-3 sm:-mx-5 -mb-3 sm:-mb-5 px-3 sm:px-5 py-3 bg-nexus-background/95 backdrop-blur border-t border-nexus-border flex items-center justify-end gap-3">
        {saved && !saving && <span className="hidden sm:inline text-sm text-nexus-success-text" role="status">Cambios guardados</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploading || !negocioId}
          className="w-full sm:w-auto inline-flex h-11 items-center justify-center gap-2 px-6 rounded-lg bg-nexus-primary hover:bg-nexus-primary-hover disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-sm cursor-pointer"
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            : <Save className="w-4 h-4" aria-hidden="true" />}
          {saving
            ? 'Guardando...'
            : uploading
              ? 'Subiendo imagen...'
              : saved
                ? 'Guardado ✓'
                : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

