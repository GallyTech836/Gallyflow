import { Building2, LayoutTemplate, Bot, UserCog } from 'lucide-react';

// Secciones de Configuración (submenú del sidebar de AdminApp).
export const SETTINGS_SECTIONS = [
  { id: 'business', label: 'Negocio', icon: Building2 },
  { id: 'hero', label: 'Link Público', icon: LayoutTemplate },
  { id: 'automation', label: 'Automatización', icon: Bot },
  { id: 'account', label: 'Cuenta y plan', icon: UserCog },
];
