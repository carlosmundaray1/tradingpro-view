"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useTzStore } from "@/lib/store/tz-store";
import {
  TZ_CATALOG,
  tzOptionOffsetLabel,
} from "@/lib/time/tz";
import { cn } from "@/lib/utils";

/**
 * Selector de zona horaria del chart, estilo TradingView Pro.
 *
 * Muestra "HH:MM:SS (UTC-4) Caracas" abajo a la derecha del chart —
 * la hora se actualiza cada segundo en la TZ seleccionada (ej: si
 * elegiste Caracas, aunque el browser esté en otra TZ, el reloj
 * marca la hora de Caracas). Click en el chip abre el dropdown.
 *
 * IMPORTANTE — hidratándose:
 * El store arranca siempre como "UTC" (estable en SSR + primer
 * render del cliente) y se rehidrata después del mount con
 * TzStoreInit. Antes del mount mostramos placeholder "—".
 */
export function TzSelector() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const selected = useTzStore((s) => s.selected);
  const selectedOption = useTzStore((s) => s.selectedOption);
  const setSelected = useTzStore((s) => s.setSelected);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Reloj vivo en la TZ seleccionada. Se actualiza cada segundo.
  const [clock, setClock] = useState<string>("--:--:--");
  useEffect(() => {
    if (!mounted) return;
    const tick = () => {
      try {
        const fmt = new Intl.DateTimeFormat("en-GB", {
          timeZone: selected,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
        setClock(fmt.format(new Date()));
      } catch {
        // tzId inválido (persistido de una versión previa): fallback a UTC
        const fmt = new Intl.DateTimeFormat("en-GB", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
        setClock(fmt.format(new Date()));
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [selected, mounted]);

  // Cerrar el dropdown al clickear fuera.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  // Placeholder estable en SSR + primer render cliente.
  let opt = selectedOption();
  let offsetLbl = tzOptionOffsetLabel(opt);
  let city = opt.city;
  if (!mounted) {
    offsetLbl = "UTC";
    city = "—";
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={!mounted}
        onClick={() => setOpen((v) => !v)}
        title="Cambiar zona horaria"
        className={cn(
          "flex items-center gap-1.5 rounded bg-tv-bg/80 px-1.5 py-0.5 text-[10px] text-tv-text ring-1 ring-tv-border/40 transition-colors",
          "hover:bg-tv-panel-hover hover:text-tv-text",
          open && "bg-tv-panel-hover text-tv-text",
        )}
      >
        <Globe className="h-3 w-3 shrink-0 text-tv-text-muted" />
        <span className="tabular-nums font-semibold text-tv-text">
          {clock}
        </span>
        <span className="tabular-nums font-medium text-tv-text-muted">
          ({offsetLbl})
        </span>
        <span className="font-medium text-tv-text-muted">{city}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-tv-text-muted" />
      </button>

      {open && mounted && (
        <div
          className="absolute bottom-6 right-0 z-30 max-h-[280px] w-56 overflow-y-auto rounded-md border border-tv-border bg-tv-panel p-1 shadow-xl"
        >
          {TZ_CATALOG.map((item) => {
            const active = item.id === selected;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelected(item.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors",
                  "hover:bg-tv-panel-hover",
                  active && "bg-tv-blue/10",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    active ? "text-tv-blue font-medium" : "text-tv-text-muted",
                  )}
                >
                  ({tzOptionOffsetLabel(item)})
                </span>
                <span
                  className={cn(
                    "truncate",
                    active ? "text-tv-blue font-medium" : "text-tv-text",
                  )}
                >
                  {item.city}
                </span>
                {active && (
                  <Check
                    className="ml-auto h-3 w-3 shrink-0 text-tv-blue"
                    strokeWidth={3}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
