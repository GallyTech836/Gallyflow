import { useCallback, useLayoutEffect, useState } from 'react';

export function useFillHeight(ref, deps = [], { min = 380, bottom = 24 } = {}) {
  const [height, setHeight] = useState(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const main = el.closest('main');
    const available = main ? main.clientHeight : window.innerHeight;
    const top = main
      ? el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop
      : el.getBoundingClientRect().top;
    // Fase 4: antes se restaba "lo que queda debajo" usando scrollHeight, pero el
    // contenedor de la pantalla ocupa todo el alto disponible, así que ese espacio
    // vacío se contaba como contenido y la agenda nunca crecía (quedaba un hueco
    // en blanco). Ahora solo se reserva el margen inferior (`bottom`).
    setHeight(Math.max(min, Math.floor(available - top - bottom)));
  }, [ref, min, bottom]);

  useLayoutEffect(() => {
    measure();
    const main = ref.current?.closest('main');
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    let ro;
    if (main && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(main);
    }
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      if (ro) ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps]);

  return height;
}