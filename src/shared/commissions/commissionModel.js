// commissionModel.js
// Fuente única de verdad sobre cómo se calcula la comisión de un profesional.
// Ni Admin ni Barber deben calcular comisiones por su cuenta: ambos importan de aquí.
//
// Regla de negocio: la comisión NO pertenece al servicio, pertenece a la
// asignación del servicio al profesional (barber.services[]). Cada entrada
// de ese array tiene la forma:
//   { serviceId, commissionEnabled, type: '%' | 'Bs', value }
//
// No existe comisión por defecto. Si el profesional no tiene ese servicio
// asignado, o lo tiene con commissionEnabled=false, o el valor no es un
// número válido, el resultado se marca como configuración incompleta
// (isConfigured: false) en vez de asumir un porcentaje por defecto.
import { getServicesFromCita } from '../appointments/serviceSelection.js';

export const COMMISSION_TYPE = {
  PERCENTAGE: '%',
  FIXED: 'Bs',
};

export const COMMISSION_ISSUE = {
  NOT_ASSIGNED: 'NOT_ASSIGNED',
  DISABLED: 'DISABLED',
  INVALID_VALUE: 'INVALID_VALUE',
  INVALID_TYPE: 'INVALID_TYPE',
};

export const COMMISSION_ISSUE_LABELS = {
  [COMMISSION_ISSUE.NOT_ASSIGNED]: 'Servicio no asignado a este profesional',
  [COMMISSION_ISSUE.DISABLED]: 'Comisión desactivada para este servicio',
  [COMMISSION_ISSUE.INVALID_VALUE]: 'Valor de comisión inválido o vacío',
  [COMMISSION_ISSUE.INVALID_TYPE]: 'Tipo de comisión inválido',
};

/**
 * Busca la asignación de servicio en el perfil del barbero.
 * @param {Object} barber - Perfil del barbero con array services[]
 * @param {string} serviceId - ID del servicio a buscar
 * @returns {Object|null} Asignación encontrada o null
 */
export function getServiceAssignment(barber, serviceId) {
  if (!barber || !Array.isArray(barber.services) || !serviceId) return null;
  return barber.services.find(s => s?.serviceId === serviceId) || null;
}

/**
 * Intenta encontrar un serviceId alternativo que coincida por nombre.
 * Útil cuando la reservación tiene un ID largo/legacy pero el barbero
 * tiene asignado el ID corto que corresponde al mismo servicio.
 *
 * @param {string} originalServiceId - ID del servicio en la reservación
 * @param {string} serviceName - Nombre del servicio
 * @param {Array} allServices - Lista global de servicios [{ id, name }, ...]
 * @returns {string|null} ID alternativo que coincide por nombre, o null
 */
function findMatchingServiceId(originalServiceId, serviceName, allServices) {
  if (!allServices || !serviceName) return null;

  // Buscar un servicio con el mismo nombre pero diferente ID
  const match = allServices.find(s => s?.name === serviceName && s?.id !== originalServiceId);
  return match?.id || null;
}

/**
 * Calcula la comisión para una reservación dada.
 *
 * @param {Object} reservation - Datos de la reservación
 * @param {string} reservation.serviceId - ID del servicio
 * @param {string} reservation.serviceName - Nombre del servicio (fallback)
 * @param {number} reservation.price - Precio del servicio
 * @param {Object} barber - Perfil del barbero con services[]
 * @param {Array} allServices - (Opcional) Lista global de servicios para resolver IDs legacy
 * @returns {Object} Resultado de la comisión con amount, isConfigured, issue, etc.
 */
export function calculateCommission(reservation, barber, allServices = null) {
  const serviceId = reservation?.serviceId;
  const serviceName = reservation?.serviceName || reservation?.service;
  const price = Number(reservation?.price || 0);

  let assignment = getServiceAssignment(barber, serviceId);

  // Fallback 1: Si no encuentra por serviceId Y tenemos serviceName,
  // intentar buscar en allServices un ID alternativo que coincida por nombre
  if (!assignment && serviceName && allServices?.length > 0) {
    // Buscar el servicio que corresponde al ID original
    const originalService = allServices.find(s => s?.id === serviceId);
    const originalName = originalService?.name || serviceName;

    // Buscar en barber.services[] un serviceId que corresponda a un servicio con el mismo nombre
    for (const assignedService of barber.services || []) {
      const matchInAllServices = allServices.find(s => s?.id === assignedService?.serviceId);
      if (matchInAllServices?.name === originalName) {
        assignment = assignedService;
        break;
      }
    }
  }

  // Fallback 2: Si aún no hay match y el serviceId parece ser un ID largo de Firestore
  // (probablemente un ID legacy generado con addDoc), buscar cualquier asignación
  // donde el servicio tenga el mismo nombre
  if (!assignment && serviceName && allServices?.length > 0) {
    for (const assignedService of barber.services || []) {
      const svc = allServices.find(s => s?.id === assignedService?.serviceId);
      if (svc?.name === serviceName) {
        assignment = assignedService;
        break;
      }
    }
  }

  if (!assignment) {
    return {
      amount: 0,
      isConfigured: false,
      issue: COMMISSION_ISSUE.NOT_ASSIGNED,
      issueLabel: COMMISSION_ISSUE_LABELS[COMMISSION_ISSUE.NOT_ASSIGNED],
      type: null,
      value: null,
    };
  }

  if (!assignment.commissionEnabled) {
    return {
      amount: 0,
      isConfigured: false,
      issue: COMMISSION_ISSUE.DISABLED,
      issueLabel: COMMISSION_ISSUE_LABELS[COMMISSION_ISSUE.DISABLED],
      type: assignment.type || null,
      value: typeof assignment.value === 'number' ? assignment.value : null,
    };
  }

  const value = Number(assignment.value);
  if (assignment.value === undefined || assignment.value === null || Number.isNaN(value)) {
    return {
      amount: 0,
      isConfigured: false,
      issue: COMMISSION_ISSUE.INVALID_VALUE,
      issueLabel: COMMISSION_ISSUE_LABELS[COMMISSION_ISSUE.INVALID_VALUE],
      type: assignment.type || null,
      value: null,
    };
  }

  if (assignment.type === COMMISSION_TYPE.FIXED) {
    return {
      amount: value,
      isConfigured: true,
      issue: null,
      issueLabel: null,
      type: COMMISSION_TYPE.FIXED,
      value,
    };
  }

  if (assignment.type === COMMISSION_TYPE.PERCENTAGE) {
    return {
      amount: (price * value) / 100,
      isConfigured: true,
      issue: null,
      issueLabel: null,
      type: COMMISSION_TYPE.PERCENTAGE,
      value,
    };
  }

  return {
    amount: 0,
    isConfigured: false,
    issue: COMMISSION_ISSUE.INVALID_TYPE,
    issueLabel: COMMISSION_ISSUE_LABELS[COMMISSION_ISSUE.INVALID_TYPE],
    type: assignment.type || null,
    value,
  };
}
/**
 * Calcula la comisión total de una cita que puede tener uno o varios
 * servicios (services[] en el esquema nuevo, o campos planos legacy).
 * Reutiliza calculateCommission() por cada servicio individual y suma
 * los resultados, sin duplicar la lógica de asignación/porcentaje/fijo.
 *
 * @param {Object} cita - Documento de cita de Firestore (legacy o nuevo)
 * @param {Object} barber - Perfil del barbero con services[]
 * @param {Array} allServices - Lista global de servicios del negocio
 * @returns {{ totalAmount: number, allConfigured: boolean, breakdown: Array }}
 */
export function calculateCommissionForCita(cita, barber, allServices = null) {
  const services = getServicesFromCita(cita);

  const breakdown = services.map((service) => {
    const result = calculateCommission(
      { serviceId: service.serviceId, serviceName: service.serviceName, price: service.price },
      barber,
      allServices
    );
    return { ...service, ...result };
  });

  const totalAmount = breakdown.reduce((sum, item) => sum + item.amount, 0);
  const allConfigured = breakdown.length > 0 && breakdown.every((item) => item.isConfigured);

  return { totalAmount, allConfigured, breakdown };
}
