"use client";

import { Plus, Eye, EyeOff, Settings, ArrowUp, ArrowDown, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useChartStore } from "@/lib/store/chart-store";
import { getDescriptor } from "@/lib/indicators/catalog";
import { cn } from "@/lib/utils";

export function IndicatorPanel() {
  const instances = useChartStore((s) => s.instances);
  const setAddDialogOpen = useChartStore((s) => s.setAddDialogOpen);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const moveIndicator = useChartStore((s) => s.moveIndicator);
  const setSettingsTargetId = useChartStore((s) => s.setSettingsTargetId);

  // orden descendente (mayor order arriba)
  const sorted = [...instances].sort((a, b) => b.order - a.order);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-tv-border px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Indicadores activos
        </h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setAddDialogOpen(true)}
          className="gap-1 px-2 py-1 text-xs text-tv-blue hover:bg-tv-blue/10"
        >
          <Plus className="h-3.5 w-3.5" />
          Añadir
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col">
          {sorted.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-tv-text-muted">
              No tienes indicadores activos. Hacé clic en “Añadir” para crear uno.
            </div>
          )}
          {sorted.map((inst, idx) => {
            const d = getDescriptor(inst.type);
            const color = inst.colors[d.series[0].key] ?? d.series[0].color;
            const paramLine = d.params
              .map((p) => `${p.label}: ${inst.params[p.key]}`)
              .join(" · ");
            return (
              <div
                key={inst.id}
                className="group flex items-start gap-2 border-b border-tv-border px-3 py-2 hover:bg-tv-panel-hover"
              >
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-tv-text">
                      {d.name}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                        inst.pane === "overlay" || inst.pane === "volume"
                          ? "bg-tv-green/15 text-tv-green"
                          : "bg-tv-blue/15 text-tv-blue",
                      )}
                    >
                      {inst.pane === "overlay" ? "Sup" : inst.pane === "volume" ? "Vol" : "Osc"}
                    </span>
                    {inst.hidden && (
                      <EyeOff className="h-3 w-3 text-tv-text-dim" />
                    )}
                  </div>
                  {paramLine && (
                    <span className="truncate text-[10px] text-tv-text-dim">
                      {paramLine}
                    </span>
                  )}
                  <div className="mt-1.5 flex items-center gap-1">
                    <ActionBtn
                      onClick={() => toggleHidden(inst.id)}
                      title={inst.hidden ? "Mostrar" : "Ocultar"}
                    >
                      {inst.hidden ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </ActionBtn>
                    <ActionBtn
                      onClick={() => setSettingsTargetId(inst.id)}
                      title="Configurar"
                    >
                      <Settings className="h-3 w-3" />
                    </ActionBtn>
                    <ActionBtn
                      onClick={() => moveIndicator(inst.id, "up")}
                      disabled={idx === 0}
                      title="Subir"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </ActionBtn>
                    <ActionBtn
                      onClick={() => moveIndicator(inst.id, "down")}
                      disabled={idx === sorted.length - 1}
                      title="Bajar"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </ActionBtn>
                    <ActionBtn
                      onClick={() => removeIndicator(inst.id)}
                      title="Eliminar"
                      className="hover:text-tv-red"
                    >
                      <X className="h-3 w-3" />
                    </ActionBtn>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  title,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={cn(
        "rounded p-1 text-tv-text-dim transition-colors hover:bg-tv-bg hover:text-tv-text",
        "disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        className,
      )}
    >
      {children}
    </button>
  );
}
