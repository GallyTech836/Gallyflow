// staffPermissionsModel.js
// Permisos configurables por profesional. Se guardan en
// negocios/{id}/profesionales/{profId}.permissions.
//
// Compatibilidad: un profesional SIN el campo `permissions` (todos los
// existentes) recibe DEFAULT_STAFF_PERMISSIONS, que replica exactamente
// lo que ya podía hacer antes de que existiera esta función.
// No requiere migración.

import { GENERIC_TERMS } from '../businessProfiles/businessProfileModel';

export const STAFF_PERMISSION_KEYS = {
    CREATE: 'createAppointments',
    EDIT: 'editAppointments',
    DELETE: 'deleteAppointments',
    CHANGE_CLIENT: 'changeAppointmentClient',
    VIEW_OTHERS: 'viewOthersAppointments',
    VIEW_COMMISSIONS: 'viewCommissions',
    VIEW_FINANCIALS: 'viewFinancials',
    OVERTIME: 'overtimeAppointments',
  };

  // "Editar citas" personalizado (Fase 4/5): modo 'all' (todo, como antes),
  // 'custom' (solo las partes marcadas). 'Nada' = editAppointments en false.
  export const EDIT_PART_KEYS = ['editFinish', 'editNotes', 'editTime', 'editServices', 'editDuration'];
  
  export const DEFAULT_STAFF_PERMISSIONS = {
    createAppointments: true,
    editAppointments: true,
    deleteAppointments: true,
    changeAppointmentClient: false,
    viewOthersAppointments: false,
    viewCommissions: true,
    viewFinancials: true,
    // Nuevos (Fase 4/5). Con estos valores por defecto, quien ya tenía
    // "Editar citas" activado conserva exactamente lo mismo ("Todo").
    editMode: 'all',
    editFinish: true,
    editNotes: true,
    editTime: true,
    editServices: true,
    editDuration: true,
    overtimeAppointments: false,
  };
  
  // Metadatos para pintar la UI de configuración (Admin), con la
  // terminología del negocio (terms = createTerms(...)); por defecto genérica.
  export function getStaffPermissionOptions(terms = GENERIC_TERMS) {
    const { tl, g } = terms;
    return [
      { key: 'createAppointments', label: `Crear ${tl('appointments')}`, hint: `Puede agendar ${tl('appointments')} desde su panel.` },
      { key: 'editAppointments', label: `Editar ${tl('appointments')}`, hint: `Puede modificar ${tl('services')}, hora, estado, pago y notas de sus ${tl('appointments')}.` },
      { key: 'deleteAppointments', label: `Eliminar ${tl('appointments')}`, hint: `Puede borrar definitivamente sus ${tl('appointments')}.` },
      { key: 'changeAppointmentClient', label: `Cambiar ${tl('client')} de ${g('appointment', 'un', 'una')} ${tl('appointment')}`, hint: `Puede modificar el nombre ${g('client', 'del', 'de la')} ${tl('client')} ${g('appointment', 'del', 'de la')} ${tl('appointment')}.` },
      { key: 'viewOthersAppointments', label: `Ver ${tl('appointments')} de ${g('professional', 'otros', 'otras')} ${tl('professionals')}`, hint: 'Las ve en modo solo lectura en su agenda.' },
      { key: 'viewCommissions', label: 'Ver comisiones', hint: 'Muestra la pestaña Comisiones.' },
      { key: 'viewFinancials', label: 'Acceder a información financiera', hint: 'Muestra la pestaña Rendimiento (ingresos) y precios.' },
      { key: 'overtimeAppointments', label: 'Agendar en sobrehorario', hint: `Puede crear o mover ${tl('appointments')} fuera del horario, confirmando el aviso.` },
    ];
  }

  // Casillas de "Editar citas" > Personalizado.
  export function getEditPartOptions(terms = GENERIC_TERMS) {
    const { tl, g } = terms;
    return [
      { key: 'editFinish', label: 'Cambiar estado, finalizar y cobrar', hint: `Iniciar, finalizar o cancelar ${g('appointment', 'el', 'la')} ${tl('appointment')} y registrar el pago.` },
      { key: 'editNotes', label: 'Escribir notas', hint: `Notas ${g('appointment', 'del', 'de la')} ${tl('appointment')}.` },
      { key: 'editTime', label: 'Cambiar la hora', hint: `Mover ${g('appointment', 'el', 'la')} ${tl('appointment')} a otra hora.` },
      { key: 'editServices', label: `Cambiar ${tl('services')}`, hint: `Agregar o quitar ${tl('services')}.` },
      { key: 'editDuration', label: 'Ajustar la duración', hint: `Cambiar los minutos de cada ${tl('service')}.` },
    ];
  }

  /** 'none' | 'all' | 'custom' */
  export function getEditMode(perms) {
    const sp = normalizeStaffPermissions(perms);
    if (!sp.editAppointments) return 'none';
    return sp.editMode === 'custom' ? 'custom' : 'all';
  }

  /** ¿Puede editar esa parte de la cita? (part = una de EDIT_PART_KEYS) */
  export function canEditPart(perms, part) {
    const mode = getEditMode(perms);
    if (mode === 'none') return false;
    if (mode === 'all') return true;
    return normalizeStaffPermissions(perms)[part] === true;
  }

  // Compatibilidad: versión con términos genéricos.
  export const STAFF_PERMISSION_OPTIONS = getStaffPermissionOptions();
  
  export function normalizeStaffPermissions(raw) {
    const out = { ...DEFAULT_STAFF_PERMISSIONS };
    if (raw && typeof raw === 'object') {
      Object.keys(DEFAULT_STAFF_PERMISSIONS).forEach((k) => {
        if (k === 'editMode') return;
        if (typeof raw[k] === 'boolean') out[k] = raw[k];
      });
      if (raw.editMode === 'custom' || raw.editMode === 'all') out.editMode = raw.editMode;
    }
    return out;
  }
  
  export function hasStaffPermission(professional, key) {
    return normalizeStaffPermissions(professional?.permissions)[key] === true;
  }
  