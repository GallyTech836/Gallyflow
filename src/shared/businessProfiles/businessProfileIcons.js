import { Scissors, Sparkles, Smile, Stethoscope, PawPrint, Dumbbell, Flower2, Tag } from 'lucide-react';

// Ícono del módulo de servicios según el tipo de negocio (solo UI).
const SERVICE_ICONS = {
  barberia: Scissors,
  salon: Sparkles,
  estetica: Sparkles,
  odontologia: Smile,
  clinica: Stethoscope,
  veterinaria: PawPrint,
  gimnasio: Dumbbell,
  spa: Flower2,
  otro: Tag,
};

export function getServiceIcon(type) {
  return SERVICE_ICONS[type] || Tag;
}