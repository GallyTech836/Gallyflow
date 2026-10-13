import { LayoutGrid } from 'lucide-react';
import ModulePlaceholder from './ModulePlaceholder';

export default function MesasPage() {
  return (
    <ModulePlaceholder
      icon={LayoutGrid}
      title="Mesas y zonas"
      description="Plano de mesas por zona con su estado."
      step="Paso 2"
      features={[
        'Zonas (Salón, Terraza…) y capacidad de cada mesa',
        'Estados: Libre, Ocupada, En preparación, Pedido listo',
        'Reservas de mesa por WhatsApp',
      ]}
    />
  );
}
