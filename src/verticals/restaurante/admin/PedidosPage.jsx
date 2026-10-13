import { ClipboardList } from 'lucide-react';
import ModulePlaceholder from './ModulePlaceholder';

export default function PedidosPage() {
  return (
    <ModulePlaceholder
      icon={ClipboardList}
      title="Pedidos y cocina"
      description="Comandas en tiempo real desde el mesero y WhatsApp."
      step="Paso 3"
      features={[
        'Columnas Nuevo, En preparación y Listo',
        'Filtro Cocina / Barra',
        'Número de mesa, productos, extras y observaciones',
        'Pedidos para llevar y delivery por WhatsApp',
      ]}
    />
  );
}
