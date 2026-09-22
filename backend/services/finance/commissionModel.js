import { getServicesFromCita } from './serviceSelection.js';

export const COMMISSION_TYPE = { PERCENTAGE: '%', FIXED: 'Bs' };

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

export function getServiceAssignment(barber, serviceId) {
  if (!barber || !Array.isArray(barber.services) || !serviceId) return null;
  return barber.services.find(s => s?.serviceId === serviceId) || null;
}

export function calculateCommission(reservation, barber, allServices = null) {
  const serviceId = reservation?.serviceId;
  const serviceName = reservation?.serviceName || reservation?.service;
  const price = Number(reservation?.price || 0);

  let assignment = getServiceAssignment(barber, serviceId);

  if (!assignment && serviceName && allServices?.length > 0) {
    const originalService = allServices.find(s => s?.id === serviceId);
    const originalName = originalService?.name || serviceName;
    for (const assignedService of barber.services || []) {
      const matchInAllServices = allServices.find(s => s?.id === assignedService?.serviceId);
      if (matchInAllServices?.name === originalName) {
        assignment = assignedService;
        break;
      }
    }
  }

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
    return { amount: 0, isConfigured: false, issue: COMMISSION_ISSUE.NOT_ASSIGNED, issueLabel: COMMISSION_ISSUE_LABELS[COMMISSION_ISSUE.NOT_ASSIGNED], type: null, value: null };
  }
  if (!assignment.commissionEnabled) {
    return { amount: 0, isConfigured: false, issue: COMMISSION_ISSUE.DISABLED, issueLabel: COMMISSION_ISSUE_LABELS[COMMISSION_ISSUE.DISABLED], type: assignment.type || null, value: typeof assignment.value === 'number' ? assignment.value : null };
  }

  const value = Number(assignment.value);
  if (assignment.value === undefined || assignment.value === null || Number.isNaN(value)) {
    return { amount: 0, isConfigured: false, issue: COMMISSION_ISSUE.INVALID_VALUE, issueLabel: COMMISSION_ISSUE_LABELS[COMMISSION_ISSUE.INVALID_VALUE], type: assignment.type || null, value: null };
  }

  if (assignment.type === COMMISSION_TYPE.FIXED) {
    return { amount: value, isConfigured: true, issue: null, issueLabel: null, type: COMMISSION_TYPE.FIXED, value };
  }
  if (assignment.type === COMMISSION_TYPE.PERCENTAGE) {
    return { amount: (price * value) / 100, isConfigured: true, issue: null, issueLabel: null, type: COMMISSION_TYPE.PERCENTAGE, value };
  }

  return { amount: 0, isConfigured: false, issue: COMMISSION_ISSUE.INVALID_TYPE, issueLabel: COMMISSION_ISSUE_LABELS[COMMISSION_ISSUE.INVALID_TYPE], type: assignment.type || null, value };
}

export function calculateCommissionForCita(cita, barber, allServices = null) {
  const services = getServicesFromCita(cita);
  const breakdown = services.map((service) => {
    const result = calculateCommission({ serviceId: service.serviceId, serviceName: service.serviceName, price: service.price }, barber, allServices);
    return { ...service, ...result };
  });
  const totalAmount = breakdown.reduce((sum, item) => sum + item.amount, 0);
  const allConfigured = breakdown.length > 0 && breakdown.every((item) => item.isConfigured);
  return { totalAmount, allConfigured, breakdown };
}