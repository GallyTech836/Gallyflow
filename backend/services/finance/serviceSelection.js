// Copia intencional — mismo motivo que availability.js: el backend no
// tiene garantizado ver src/shared/ en el deploy de Railway.

export function getServicesFromCita(cita) {
    if (!cita) return [];
    if (Array.isArray(cita.services) && cita.services.length > 0) {
      return cita.services;
    }
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