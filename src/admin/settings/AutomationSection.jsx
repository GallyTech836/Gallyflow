import AssistantSection from './AssistantSection';

// Automatización = Asistente de WhatsApp (número conectado, interruptor,
// reprogramación y personalidad). La maqueta anterior (QR simulado,
// disparadores, plantillas y logs locales) se quitó: no enviaba nada.
// Las notificaciones automáticas (confirmación/recordatorio) son un
// complemento aparte de la versión 2.
export default function AutomationSection({ negocioId }) {
  return <AssistantSection negocioId={negocioId} />;
}
