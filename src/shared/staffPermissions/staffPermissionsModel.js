// staffPermissionsModel.js
// Permisos configurables por profesional. Se guardan en
// negocios/{id}/profesionales/{profId}.permissions.
//
// Compatibilidad: un profesional SIN el campo `permissions` (todos los
// existentes) recibe DEFAULT_STAFF_PERMISSIONS, que replica exactamente
// lo que ya podía hacer antes de que existiera esta función.
// No requiere migración.

export const STAFF_PERMISSION_KEYS = {
    CREATE: 'createAppointments',
    EDIT: 'editAppointments',
    DELETE: 'deleteAppointments',
    CHANGE_CLIENT: 'changeAppointmentClient',
    VIEW_OTHERS: 'viewOthersAppointments',
    VIEW_COMMISSIONS: 'viewCommissions',
    VIEW_FINANCIALS: 'viewFinancials',
  };
  
  export const DEFAULT_STAFF_PERMISSIONS = {
    createAppointments: true,
    editAppointments: true,
    deleteAppointments: true,
    changeAppointmentClient: false,
    viewOthersAppointments: false,
    viewCommissions: true,
    viewFinancials: true,
  };
  
  // Metadatos para pintar la UI de configuración (Admin).
  export const STAFF_PERMISSION_OPTIONS = [
    { key: 'createAppointments', label: 'Crear citas', hint: 'Puede agendar citas desde su panel.' },
    { key: 'editAppointments', label: 'Editar citas', hint: 'Puede modificar servicios, hora, estado, pago y notas de sus citas.' },
    { key: 'deleteAppointments', label: 'Eliminar citas', hint: 'Puede borrar definitivamente sus citas.' },
    { key: 'changeAppointmentClient', label: 'Cambiar cliente de una cita', hint: 'Puede modificar el nombre del cliente de la cita.' },
    { key: 'viewOthersAppointments', label: 'Ver citas de otros profesionales', hint: 'Las ve en modo solo lectura en su agenda.' },
    { key: 'viewCommissions', label: 'Ver comisiones', hint: 'Muestra la pestaña Comisiones.' },
    { key: 'viewFinancials', label: 'Acceder a información financiera', hint: 'Muestra la pestaña Rendimiento (ingresos) y precios.' },
  ];
  
  export function normalizeStaffPermissions(raw) {
    const out = { ...DEFAULT_STAFF_PERMISSIONS };
    if (raw && typeof raw === 'object') {
      Object.keys(DEFAULT_STAFF_PERMISSIONS).forEach((k) => {
        if (typeof raw[k] === 'boolean') out[k] = raw[k];
      });
    }
    return out;
  }
  
  export function hasStaffPermission(professional, key) {
    return normalizeStaffPermissions(professional?.permissions)[key] === true;
  }
  