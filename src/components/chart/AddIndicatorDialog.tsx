"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { INDICATOR_CATALOG, getDescriptor, type IndicatorDescriptor } from "@/lib/indicators/catalog";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "Medias móviles",
  "Bandas",
  "Volatilidad",
  "Osciladores",
  "Volumen",
  "Tendencia",
  "Otros",
] as const;

export function AddIndicatorDialog() {
  const open = useChartStore((s) => s.addDialogOpen);
  const setOpen = useChartStore((s) => s.setAddDialogOpen);
  const addIndicator = useChartStore((s) => s.addIndicator);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return INDICATOR_CATALOG;
    return INDICATOR_CATALOG.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.hint ?? "").toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q),
    );
  }, [query]);

  const byCategory = (cat: string) => filtered.filter((d) => d.category === cat);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
    >
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">Añadir indicador</DialogTitle>
        </DialogHeader>
        <div className="border-b border-tv-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tv-text-muted" />
            <Input
              autoFocus
              placeholder="Buscar… EMA, RSI, MACD, Bollinger…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <ScrollArea className="h-[420px]">
          <div className="flex flex-col">
            {filtered.length === 0 && (
              <div className="p-6 text-center text-xs text-tv-text-muted">
                Sin resultados para “{query}”
              </div>
            )}
            {CATEGORIES.map((cat) => {
              const items = byCategory(cat);
              if (items.length === 0) return null;
              return (
                <div key={cat} className="border-b border-tv-border last:border-0">
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
                    {cat}
                  </div>
                  {items.map((d) => (
                    <IndicatorRow
                      key={d.type}
                      d={d}
                      onAdd={() => {
                        // Auto-overlay: si el descriptor es overlay-friendly
                        // (ownsOverlayAxis) y ya existe al menos un indicador
                        // "separate" no oculto, anclamos el nuevo indicador al
                        // pane del primer separate (overlayPaneIndex=1) para
                        // reproducir el eje doble de TV Pro (ej: ADX sobre el
                        // pane del Squeeze). Si no hay separados previos, se
                        // crea como pane nuevo dedicado.
                        let overrides: { overlayPaneIndex?: number } = {};
                        if (d.ownsOverlayAxis === "right" || d.ownsOverlayAxis === "left") {
                          const hasSeparate = useChartStore
                            .getState()
                            .instances.some(
                              (i) => i.type !== d.type && !i.hidden && getDescriptor(i.type).pane === "separate",
                            );
                          if (hasSeparate) overrides = { overlayPaneIndex: 1 };
                        }
                        addIndicator(d.type, overrides);
                        setOpen(false);
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function IndicatorRow({
  d,
  onAdd,
}: {
  d: IndicatorDescriptor;
  onAdd: () => void;
}) {
  const paramSummary = d.params.length > 0 ? d.params.map((p) => p.default).join(", ") : "";
  return (
    <div className="flex items-center justify-between px-3 py-2 hover:bg-tv-panel-hover">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-tv-text">{d.name}</span>
        <span className="text-[10px] text-tv-text-dim">
          {d.hint}
          {paramSummary && ` · defaults ${paramSummary}`}
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onAdd}
        className={cn(
          "px-2 py-1 text-xs font-medium",
          "bg-tv-blue/10 text-tv-blue hover:bg-tv-blue/20",
        )}
      >
        Añadir
      </Button>
    </div>
  );
}
