"use client";

import { Eye, EyeOff, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  instanceId: string;
  name: string;
  value?: string;
  color: string;
  hidden: boolean;
  onToggleHide: () => void;
  onSettings: () => void;
  onRemove: () => void;
}

export function IndicatorPill({
  instanceId,
  name,
  value,
  color,
  hidden,
  onToggleHide,
  onSettings,
  onRemove,
}: Props) {
  void instanceId;
  return (
    <div
      className={cn(
        "group/pill pointer-events-auto flex items-center gap-1 rounded bg-tv-panel/90 px-1 py-0.5 text-[10px] leading-none shadow-sm ring-1 ring-tv-border backdrop-blur",
        hidden && "opacity-50",
      )}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="font-medium text-tv-text">{name}</span>
      {value !== undefined && (
        <span className="tabular-nums text-tv-text-muted">{value}</span>
      )}
      <div className="ml-0.5 flex items-center gap-0.5 opacity-60 transition-opacity group-hover/pill:opacity-100">
        <button
          onClick={onToggleHide}
          title={hidden ? "Mostrar" : "Ocultar"}
          aria-label={hidden ? "Mostrar" : "Ocultar"}
          className="rounded p-0.5 text-tv-text-dim transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
        >
          {hidden ? (
            <EyeOff className="h-2.5 w-2.5" />
          ) : (
            <Eye className="h-2.5 w-2.5" />
          )}
        </button>
        <button
          onClick={onSettings}
          title="Configurar"
          aria-label="Configurar"
          className="rounded p-0.5 text-tv-text-dim transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Settings className="h-2.5 w-2.5" />
        </button>
        <button
          onClick={onRemove}
          title="Eliminar"
          aria-label="Eliminar"
          className="rounded p-0.5 text-tv-text-dim transition-colors hover:bg-tv-panel-hover hover:text-tv-red"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}
