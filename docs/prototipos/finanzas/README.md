# Prototipo · Finanzas, Dashboard y Analítica

Prototipo navegable aprobado para el nuevo módulo de Finanzas. **No es código de la app**: es un HTML suelto con datos de ejemplo, para mostrar a dueños de negocio y como referencia antes de implementar.

Abrir `prototipo.html` con doble clic (necesita internet para cargar React e Inter).

## Qué muestra

- **Dashboard**: igual que hoy, sin «Comisión estimada», sin Mes/Año en el selector y sin «Pagos del periodo».
- **Finanzas** (nuevo, con PIN): Resumen (entró / salió / ganancia aproximada + desglose), Gastos (una lista, «Se repite cada mes», «Por pagar») y Administrar cuentas (los cobros que llegan a cada cuenta se eligen desde la cuenta). Pregunta inicial al entrar por primera vez: a qué cuenta llega cada método de pago.
- **Comisiones**: igual que hoy (Liquidar pide el método; ahora se sabe de qué cuenta sale).
- **Analítica**: igual que hoy, sin «Rendimiento general». Nuevo: **Punto de equilibrio** (gastos fijos ÷ margen del mes).
- **Inventario**: «Registrar compra» suma stock y deja el gasto o la deuda en Finanzas.
- **Configuración**: sin cambios.

Colores: paleta Negro puro; verde solo para lo positivo y rojo solo para lo negativo.
