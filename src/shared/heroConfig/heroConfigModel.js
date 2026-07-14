// === MODELO DE heroConfig ===
// Fuente única de verdad para la forma del dato y sus valores por defecto.
// Tanto AdminApp (formulario + preview) como ClienteApp (pantalla real)
// importan esto para no duplicar lógica ni arriesgarse a que un negocio
// nuevo (sin heroConfig todavía) rompa la pantalla inicial.
//
// Vive dentro de negocios/{negocioId} como el campo `heroConfig`.
// No es una colección propia.

export const DEFAULT_HERO_CONFIG = {
  businessName: 'GALLYFLOW',
  slogan: 'Agenda citas de forma rápida y segura desde cualquier dispositivo en nuestra plataforma premium.',
  logo: '',
  cover: '',
  showRating: false,
  rating: 4.9,
  highlightText: '',
};

/**
 * Normaliza cualquier dato crudo proveniente de Firestore (o de un
 * formulario) al shape completo y seguro de heroConfig. Si falta un campo,
 * o viene con un tipo inválido, cae al valor por defecto correspondiente
 * en vez de romper el render.
 */
export function normalizeHeroConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_HERO_CONFIG };
  }

  const rating = Number(raw.rating);

  return {
    businessName:
      typeof raw.businessName === 'string' && raw.businessName.trim()
        ? raw.businessName.trim()
        : DEFAULT_HERO_CONFIG.businessName,
    slogan:
      typeof raw.slogan === 'string' && raw.slogan.trim()
        ? raw.slogan
        : DEFAULT_HERO_CONFIG.slogan,
    logo: typeof raw.logo === 'string' ? raw.logo.trim() : DEFAULT_HERO_CONFIG.logo,
    cover: typeof raw.cover === 'string' ? raw.cover.trim() : DEFAULT_HERO_CONFIG.cover,
    showRating: typeof raw.showRating === 'boolean' ? raw.showRating : DEFAULT_HERO_CONFIG.showRating,
    rating: Number.isFinite(rating) ? rating : DEFAULT_HERO_CONFIG.rating,
    highlightText:
      typeof raw.highlightText === 'string' ? raw.highlightText.trim() : DEFAULT_HERO_CONFIG.highlightText,
  };
}