// serviceSelection.js
//
// Punto único de verdad para leer los servicios de una cita, sea que use
// el esquema nuevo (services[]) o el esquema legacy (serviceId/price/duration
// planos a nivel raíz del documento). Nadie más debe leer cita.serviceId
// directo: todos pasan por getServicesFromCita().

/**
 * Devuelve siempre un array de servicios, sin importar si la cita es
 * legacy (un solo servicio, campos planos) o nueva (services[]).
 *
 * @param {Object} cita - Documento de cita de Firestore
 * @returns {Array<{serviceId, serviceName, price, duration}>}
 */
export function getServicesFromCita(cita) {
    if (!cita) return [];
  
    if (Array.isArray(cita.services) && cita.services.length > 0) {
      return cita.services;
    }
  
    // Cita legacy: un solo servicio en campos planos. Se envuelve en un
    // array de 1 elemento para que el resto del código nunca tenga que
    // distinguir entre "cita vieja" y "cita nueva".
    if (cita.serviceId) {
      return [{
        serviceId: cita.serviceId,
        serviceName: cita.serviceName || cita.service || '',
        price: Number(cita.price || 0),
        duration: Number(cita.duration || 30),
      }];
    }
  
    return [];
  }
  
  /**
   * Calcula el precio y la duración total de una lista de servicios.
   *
   * @param {Array} services - Array de servicios (formato getServicesFromCita)
   * @returns {{ totalPrice: number, totalDuration: number }}
   */
  export function calculateTotals(services = []) {
    return services.reduce(
      (acc, s) => ({
        totalPrice: acc.totalPrice + Number(s?.price || 0),
        totalDuration: acc.totalDuration + Number(s?.duration || 30),
      }),
      { totalPrice: 0, totalDuration: 0 }
    );
  }