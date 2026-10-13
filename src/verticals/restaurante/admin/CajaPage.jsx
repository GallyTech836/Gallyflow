import { Wallet } from 'lucide-react';
import ModulePlaceholder from './ModulePlaceholder';

export default function CajaPage() {
  return (
    <ModulePlaceholder
      icon={Wallet}
      title="Caja y cobros"
      description="Cuentas abiertas por mesa y cobro."
      step="Paso 4"
      features={[
        'Detalle del consumo por mesa',
        'Descuentos y división de cuenta',
        'Efectivo, QR, Tarjeta y Transferencia',
        'Cierre de cuenta y comprobante',
      ]}
    />
  );
}
