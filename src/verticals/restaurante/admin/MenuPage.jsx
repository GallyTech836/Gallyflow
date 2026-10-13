import { UtensilsCrossed } from 'lucide-react';
import ModulePlaceholder from './ModulePlaceholder';

export default function MenuPage() {
  return (
    <ModulePlaceholder
      icon={UtensilsCrossed}
      title="Menú"
      description="Categorías y productos que ve el mesero y el bot de WhatsApp."
      step="Paso 2"
      features={[
        'Categorías y productos con precio en Bs',
        'Extras con costo y observaciones rápidas',
        'Destino de impresión: Cocina o Barra',
        'Activar o pausar un producto al instante',
      ]}
    />
  );
}
