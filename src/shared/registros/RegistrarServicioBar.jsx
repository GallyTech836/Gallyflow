import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Button } from '../ui';

// Campos donde se abre el teclado del celular.
const TEXT_INPUT_TYPES = ['text', 'search', 'email', 'tel', 'url', 'number', 'password', 'date', 'time'];
function isTextField(el) {
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && TEXT_INPUT_TYPES.includes((el.type || 'text').toLowerCase());
}

/** true mientras un campo de texto tiene el foco (teclado del celular abierto). */
function useTypingFocus() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const onFocusIn = () => setTyping(isTextField(document.activeElement));
    // Al salir, el foco todavía no llegó al siguiente elemento: se mira un instante después.
    const onFocusOut = () => setTimeout(() => setTyping(isTextField(document.activeElement)), 0);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);
  return typing;
}

// Abajo de la pantalla, con el área segura del iPhone.
export const BAR_AT_BOTTOM = 'bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]';
// Para un "Guardar" pegado abajo (sticky bottom-0): en celular y tablet queda
// justo encima de la barra (borde + 0.75rem + botón h-11 + área segura).
export const STICKY_ABOVE_BAR = 'bottom-[calc(3.5rem+1px+max(0.75rem,env(safe-area-inset-bottom)))] lg:bottom-0';

/**
 * Barra fija "Registrar servicio" para celular y tablet (modo registros).
 * En escritorio (lg o más) no se muestra: allí queda el botón de siempre.
 * Va debajo de los modales (z-30) y se esconde mientras se escribe, para no
 * quedar encima del teclado.
 *
 * - label: texto del botón.
 * - position: clases de posición y padding inferior (por defecto, abajo de todo).
 */
export default function RegistrarServicioBar({ label, onClick, position = BAR_AT_BOTTOM }) {
  const typing = useTypingFocus();
  if (typing) return null;
  return (
    <div className={`fixed inset-x-0 z-30 border-t border-nexus-border bg-nexus-surface px-3 pt-3 shadow-[var(--nx-shadow-sm)] lg:hidden ${position}`}>
      <Button fullWidth size="lg" icon={ClipboardList} onClick={onClick}>{label}</Button>
    </div>
  );
}
