"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  TZ_CATALOG,
  tzOptionOffsetLabel,
  type TzOption,
} from "@/lib/time/tz";

interface TzState {
  /** IANA id de la TZ seleccionada (default = "UTC" en SSR; el valor
   *  real se rehidrata desde localStorage o detecta el efecto del
   *  storeInit en el cliente). */
  selected: string;
  /** Bandera: true después de hidratar desde localStorage o detectar
   *  la TZ del browser (primer mount del cliente). */
  hydrated: boolean;
  /** Devuelve la TzOption activa. */
  selectedOption: () => TzOption;
  /** Setter. Recibe el id IANA. */
  setSelected: (id: string) => void;
  /** Marca el store como hidratado. */
  markHydrated: () => void;
}

function detectBrowserTz(): string {
  if (typeof window === "undefined") return "UTC";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return "UTC";
    return tz;
  } catch {
    return "UTC";
  }
}

/** Initial state siempre "UTC" — ningún valor dependiente del browser
 *  en el initializer para no romper la hydration de Next 16. El valor
 *  real se setea en un effect TzStoreInit que corre del lado del
 *  cliente únicamente. */
export const useTzStore = create<TzState>()(
  persist(
    (set, get) => ({
      selected: "UTC",
      hydrated: false,
      selectedOption: () => {
        const id = get().selected;
        return (
          TZ_CATALOG.find((t) => t.id === id) ?? {
            id,
            city: id.split("/").pop()?.replace(/_/g, " ") ?? "UTC",
            offsetHours: 0,
          }
        );
      },
      setSelected: (id: string) => set({ selected: id }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "tv-tz-store",
      partialize: (s) => ({ selected: s.selected }),
      // Desactivar la hidratación automática para evitar el mismatch
      // server/cliente. La hacemos manualmente en TzStoreInit con
      // useStore.persist.rehydrate() después del mount.
      skipHydration: true,
    },
  ),
);

/** Hook cómodo para leer label offset actual (ej: "UTC-4"). */
export function useTzOffsetLabel(): string {
  const opt = useTzStore((s) => s.selectedOption());
  return tzOptionOffsetLabel(opt);
}
