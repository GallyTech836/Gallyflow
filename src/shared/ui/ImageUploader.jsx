import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Upload, Trash2, Loader2 } from 'lucide-react';
import { uploadImage, cloudinaryThumb } from '../cloudinary/uploadImage';

/**
 * Subida de una foto a Cloudinary con vista previa (servicios, sucursales,
 * productos...). La imagen se reduce en el navegador antes de subirla.
 *
 * value: URL guardada ('' = sin foto). onChange(url). onUploadingChange(bool)
 * shape: 'square' | 'wide'. fallback: imagen a mostrar si no hay foto propia
 * (ej. la portada del negocio), con el texto fallbackLabel.
 */
export default function ImageUploader({
  value = '',
  onChange,
  onUploadingChange,
  label = 'Foto',
  hint = 'JPG, PNG o WEBP. Se optimiza automáticamente.',
  shape = 'square',
  maxSize = 1200,
  fallback = '',
  fallbackLabel = '',
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const setBusy = (v) => { setUploading(v); onUploadingChange?.(v); };

  const handleFile = async (file) => {
    if (!file || disabled) return;
    if (!file.type?.startsWith('image/')) { setError('El archivo debe ser una imagen.'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('La imagen es muy pesada (máx. 15 MB).'); return; }
    setError('');
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const url = await uploadImage(file, { maxSize });
      onChange?.(url);
    } catch (err) {
      console.error('[ImageUploader] Error al subir:', err);
      setError('No se pudo subir la foto. Inténtalo de nuevo.');
    } finally {
      setPreview('');
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const shown = preview || (value ? cloudinaryThumb(value, shape === 'wide' ? 800 : 300) : '');
  const usingFallback = !shown && fallback;
  const box = shape === 'wide' ? 'w-28 h-20 sm:w-32' : 'w-20 h-20';

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-xs font-medium text-nexus-text-secondary">{label}</span>}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
        className="flex items-center gap-3 rounded-xl border border-dashed border-nexus-border bg-nexus-background p-3 transition-colors hover:border-nexus-primary/50"
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          aria-label={value ? 'Cambiar foto' : 'Subir foto'}
          className={`relative ${box} shrink-0 overflow-hidden rounded-lg border border-nexus-border bg-nexus-surface flex items-center justify-center cursor-pointer disabled:cursor-not-allowed`}
        >
          {shown ? (
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : usingFallback ? (
            <img src={cloudinaryThumb(fallback, 300)} alt="" className="h-full w-full object-cover opacity-60" />
          ) : (
            <ImagePlus className="h-6 w-6 text-nexus-text-muted" aria-hidden="true" />
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-nexus-primary/25 bg-nexus-primary-soft px-3 text-sm font-semibold text-nexus-primary transition-opacity hover:opacity-80 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {uploading ? 'Subiendo…' : value ? 'Cambiar foto' : 'Subir foto'}
            </button>
            {value && !uploading && (
              <button
                type="button"
                onClick={() => onChange?.('')}
                disabled={disabled}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-nexus-error-text hover:bg-nexus-error-bg cursor-pointer"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Quitar
              </button>
            )}
          </div>
          <p className="text-xs text-nexus-text-muted">
            {usingFallback && fallbackLabel ? fallbackLabel : hint}
          </p>
          {error && <p role="alert" className="text-xs text-nexus-error-text">{error}</p>}
        </div>
      </div>
    </div>
  );
}
