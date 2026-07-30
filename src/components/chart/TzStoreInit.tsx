"use client";

import { useEffect } from "react";
import { useTzStore } from "@/lib/store/tz-store";

/**
 * Inicializa el estado de la zona horaria DESPUÉS del mount del cliente.
 *
 * El store arranca siempre con `selected: "UTC"` (estable en SSR + primer
 * render del cliente) y `hydrated: false`. Después del mount, este
 * componente:
 *   1. Rehidrata el valor persistido en localStorage (si existe).
 *   2. Si no había valor guardado, detecta la TZ del browser.
 *   3. Marca `hydrated: true` para que los componentes suscritos
 *      (TzSelector, useChart) muestren el valor real.
 *
 * El componente renderiza `null` (no pinta nada visible).
 */
export function TzStoreInit() {
  const markHydrated = useTzStore((s) => s.markHydrated);

  useEffect(() => {
    // Rehidratar valor persistido (si hay). Si el usuario ya eligió una
    // TZ previamente, persisted store la tiene; skipHydration:true la
    // dejó pendiente hasta este momento.
    const persistApi = (useTzStore as unknown as {
      persist?: { rehydrate?: () => void };
    }).persist;
    if (persistApi?.rehydrate) {
      persistApi.rehydrate();
    }

    // Default: "UTC" (cierre oficial de velas en Binance / estándar
    // cripto). El usuario puede elegir otra zona desde el TzSelector y
    // esa elección se persiste en localStorage —下次 visitas se respeta.
    markHydrated();
  }, [markHydrated]);

  return null;
}
