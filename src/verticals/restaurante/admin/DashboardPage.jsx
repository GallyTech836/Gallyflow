import { LayoutDashboard } from 'lucide-react';
import ModulePlaceholder from './ModulePlaceholder';

export default function DashboardPage() {
  return (
    <ModulePlaceholder
      icon={LayoutDashboard}
      title="Dashboard"
      description="Resumen del día del restaurante."
      step="Paso 5"
      features={[
        'Ventas del día, pedidos y ticket promedio',
        'Mesas ocupadas',
        'Productos más vendidos',
        'Ventas por método de pago y por mesero',
      ]}
    />
  );
}
