"use client";

import {
  MousePointer2,
  Minus,
  Ruler,
  Trash2,
  Spline,
  GitCommit,
  Target,
  ZoomIn,
  ZoomOut,
  Eraser,
  Type,
  PenLine,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface ToolDef {
  key: DrawingTool;
  icon: typeof MousePointer2;
  label: string;
  hint?: string;
  /** Separador visual antes de este botón (categoría nueva). */
  divider?: boolean;
}

const TOOLS: ToolDef[] = [
  // ── Navegación / selección ──
  { key: "cursor", icon: MousePointer2, label: "Cursor", hint: "Modo navegación" },

  // ── Líneas (precios + tendencias) ──
  {
    key: "hline",
    icon: Minus,
    label: "Línea horizontal",
    hint: "Click en el chart para marcar un precio",
  },
  {
    key: "trend",
    icon: Spline,
    label: "Línea de tendencia",
    hint: "2 clicks: punto A → punto B. Se extrapolada al ancho del pane.",
    divider: true,
  },
  {
    key: "fib",
    icon: GitCommit,
    label: "Fibonacci (retracement)",
    hint: "2 clicks: swing A → swing B. Niveles 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618.",
  },

  // ── Medidas ──
  {
    key: "measure",
    icon: Ruler,
    label: "Regla / Medir",
    hint: "2 clicks: Δ precio, %, barras, volumen y duración.",
    divider: true,
  },

  // ── Posiciones ──
  {
    key: "long_pos",
    icon: Target,
    label: "Posición larga",
    hint: "3 clicks: entry → target → stop. Calcula R:R, P/L y Qty.",
    divider: true,
  },

  // ── Texto / Pincel ──
  {
    key: "text",
    icon: Type,
    label: "Texto",
    hint: "1 click en el chart para una nota editable. Borra el contenido para eliminarla.",
    divider: true,
  },
  {
    key: "brush",
    icon: PenLine,
    label: "Pincel (freehand)",
    hint: "Mantené apretado el botón y arrastrá para dibujar. Soltá para fijar el trazo.",
  },

  // ── Zoom ──
  {
    key: "zoom_in",
    icon: ZoomIn,
    label: "Acercar (zoom in)",
    hint: "Click para acercar ×2 sobre la posición del cursor.",
    divider: true,
  },
  {
    key: "zoom_out",
    icon: ZoomOut,
    label: "Alejar (zoom out)",
    hint: "Click para alejar ×2 sobre la posición del cursor.",
  },

  // ── Borrado ──
  {
    key: "eraser",
    icon: Eraser,
    label: "Borrador",
    hint: "Click en el chart para borrar todos los dibujos del símbolo actual.",
    divider: true,
  },
];

export function LeftSidebar() {
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const clearPriceLines = useChartStore((s) => s.clearPriceLines);
  const symbol = useChartStore((s) => s.symbol);

  return (
    <aside className="flex w-11 flex-col items-center gap-0.5 overflow-y-auto border-r border-tv-border bg-tv-panel py-1.5">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const active = tool === t.key;
        return (
          <div key={t.key} className="flex flex-col items-center">
            {t.divider && <div className="my-1 h-px w-6 bg-tv-border" />}
            <Tooltip>
              <TooltipTrigger
                onClick={() => setTool(t.key)}
                aria-label={t.label}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-tv-panel-hover",
                  active
                    ? "bg-tv-blue/15 text-tv-blue"
                    : "text-tv-text-muted hover:text-tv-text",
                )}
              >
                <Icon className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                <div className="font-medium">{t.label}</div>
                {t.hint && (
                  <div className="mt-0.5 text-[10px] text-tv-text-muted">{t.hint}</div>
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        );
      })}

      <Tooltip>
        <TooltipTrigger
          onClick={() => clearPriceLines(symbol)}
          aria-label="Borrar dibujos"
          className="mt-1 flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-red"
        >
          <Trash2 className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          <div className="font-medium">Borrar líneas de precio</div>
          <div className="mt-0.5 text-[10px] text-tv-text-muted">
            Limpia las hlines de este símbolo
          </div>
        </TooltipContent>
      </Tooltip>

      <div className="my-1 h-px w-6 bg-tv-border" />
    </aside>
  );
}
