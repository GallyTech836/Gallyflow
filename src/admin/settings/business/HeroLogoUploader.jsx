import React, { useRef, useState } from 'react';
import { Upload, Loader as Loader2, ImagePlus } from 'lucide-react';
import { uploadImage } from '../../../shared/cloudinary/uploadImage';

export default function HeroLogoUploader({ value, onChange, onUploadingChange }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const setUploadingState = (state) => {
    setUploading(state);
    onUploadingChange?.(state);
  };

  const handleFile = async (file) => {
    if (!file) return;
    const localPreviewUrl = URL.createObjectURL(file);
    onChange(localPreviewUrl);
    setUploadingState(true);
    try {
      const cloudinaryUrl = await uploadImage(file);
      onChange(cloudinaryUrl);
    } catch (err) {
      console.error('Error al subir el logo:', err);
    } finally {
      setUploadingState(false);
    }
  };

  const handleFileChange = (e) => handleFile(e.target.files?.[0]);
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="flex items-center gap-4 bg-[#0A0D1A] border border-dashed border-[#232B4A] hover:border-indigo-500/50 rounded-xl p-4 transition-colors group"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Preview circular */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="relative w-14 h-14 rounded-xl border-2 border-[#1E2442] group-hover:border-indigo-500/40 transition-colors bg-[#131728] flex items-center justify-center overflow-hidden shrink-0 cursor-pointer"
      >
        {value ? (
          <img src={value} alt="Logo" className="w-full h-full object-cover" />
        ) : (
          <ImagePlus className="w-5 h-5 text-slate-600" />
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          </div>
        )}
      </div>

      {/* Info + botón */}
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/25 text-indigo-400 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-1.5"
        >
          <Upload className="w-3 h-3" />
          {uploading ? 'Subiendo...' : 'Subir Logo'}
        </button>
        <p className="text-[9px] text-slate-600 leading-relaxed">
          PNG, JPG o WEBP. Máx 2MB.<br />
          Recomendado: 512×512px
        </p>
      </div>
    </div>
  );
}
