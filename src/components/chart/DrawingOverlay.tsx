"use client";

import { useEffect, useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { formatPrice, formatVolume } from "@/lib/format";
import type {
  TrendLine,
  FibRetracement,
  LongPosition,
  TextNote,
  BrushStroke,
  DrawingPoint,
} from "@/lib/store/chart-store";

/** Resuelve (time, price) -> (x, y) en pixeles del contenedor del chart. */
function toXY(
  candleSeries: ISeriesApi<"Candlestick">,
  timeScale: ReturnType<IChartApi["timeScale"]>,
  time: number,
  price: number,
): { x: number; y: number } | null {
  try {
    const x = timeScale.timeToCoordinate(time as UTCTimestamp);
    const y = candleSeries.priceToCoordinate(price);
    if (x === null || y === null || !isFinite(x) || !isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

interface Props {
  candleSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>;
  chartRef: React.RefObject<IChartApi | null>;
  trendLines: TrendLine[];
  fibRetracements: FibRetracement[];
  longPositions: LongPosition[];
  textNotes: TextNote[];
  brushStrokes: BrushStroke[];
  /** Versión que sube cada vez que las velas / range cambia, para forzar
   * re-computar las coordenadas. */
  recalcTick: number;
  /** Item actualmente en estado "preview" (colocando) antes del segundo click. */
  preview?: PreviewDrawing | null;
  /** Click handler para borrar elemento (botón X al lado del label). */
  onRemove?: (kind: "trend" | "fib" | "long" | "text" | "brush", id: string) => void;
  /** Handler para actualizar el texto in-place (contentEditable). */
  onUpdateText?: (id: string, text: string) => void;
}

/** Dibujo transitorio mientras el usuario está colocando. */
export type PreviewDrawing =
  | { kind: "trend"; a: DrawingPoint; b: DrawingPoint; color: string }
  | { kind: "fib"; a: DrawingPoint; b: DrawingPoint; color: string }
  | {
      kind: "long";
      phase: "entry_target" | "stop";
      entry: DrawingPoint;
      target?: DrawingPoint;
      cursor: DrawingPoint;
      color: string;
      qty: number;
    }
  | { kind: "brush"; points: DrawingPoint[]; color: string; width: number }
  | { kind: "text"; anchor: DrawingPoint; text: string; color: string; fontSize: number };

const FIB_LEVELS = [
  { r: 0, label: "0" },
  { r: 0.236, label: "0.236" },
  { r: 0.382, label: "0.382" },
  { r: 0.5, label: "0.5" },
  { r: 0.618, label: "0.618" },
  { r: 0.786, label: "0.786" },
  { r: 1, label: "1" },
  { r: 1.618, label: "1.618" },
  { r: 2.618, label: "2.618" },
];

/** Construye el `d` de un <path> SVG a partir de una secuencia de puntos
 * (time, price) ya resueltos a pixeles. Usa LineTo simple — el usuario
 * hizo el trazo a mano y lightweight-charts ya scaleX en tiempo, así que
 * la curva se ve igual que al dibujarla. */
function pointsToPathD(
  candleSeries: ISeriesApi<"Candlestick">,
  timeScale: ReturnType<IChartApi["timeScale"]>,
  points: DrawingPoint[],
): string | null {
  if (points.length === 0) return null;
  const coords = points
    .map((p) => toXY(candleSeries, timeScale, p.time, p.price))
    .filter((c): c is { x: number; y: number } => c !== null);
  if (coords.length === 0) return null;
  let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 1; i < coords.length; i++) {
    d += ` L ${coords[i].x.toFixed(1)} ${coords[i].y.toFixed(1)}`;
  }
  return d;
}

export function DrawingOverlay({
  candleSeriesRef,
  chartRef,
  trendLines,
  fibRetracements,
  longPositions,
  textNotes,
  brushStrokes,
  recalcTick,
  preview,
  onRemove,
  onUpdateText,
}: Props) {
  // React 19 prohíbe leer `ref.current` durante el render. Guardamos chart
  // y candleSeries en estado local; el effect los sincroniza cuando cambian
  // los refs o cuando `recalcTick` sube (eso pasa en cada scroll/zoom/nuevas
  // velas/adding/borrado de drawings — justo cuando el ref pudo cambiar).
  const [chart, setChart] = useState<IChartApi | null>(null);
  const [candleSeries, setCandleSeries] = useState<ISeriesApi<"Candlestick"> | null>(null);
  useEffect(() => {
    setChart(chartRef.current);
    setCandleSeries(candleSeriesRef.current);
  }, [chartRef, candleSeriesRef, recalcTick]);

  const renderKey = `${recalcTick}-${preview ? JSON.stringify(preview) : "0"}`;

  if (!candleSeries || !chart) return null;
  const ts = chart.timeScale();

  const renderTrend = (line: TrendLine, dashed = false) => {
    const a = toXY(candleSeries!, ts, line.a.time, line.a.price);
    const b = toXY(candleSeries!, ts, line.b.time, line.b.price);
    if (!a || !b) return null;
    // Extrapolate: extend the line across the pane width.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0) return null;
    const containerW = chart!.chartElement().clientWidth;
    const extEnd: { x: number; y: number } = { x: containerW, y: a.y + (dy * (containerW - a.x)) / dx };
    return (
      <g key={`trend-${line.id}`} className="pointer-events-none">
        <line
          x1={a.x}
          y1={a.y}
          x2={extEnd.x}
          y2={extEnd.y}
          stroke={line.color}
          strokeWidth={line.width ?? 1.5}
          strokeDasharray={dashed ? "5,4" : undefined}
          opacity={dashed ? 0.7 : 1}
        />
        <circle cx={a.x} cy={a.y} r={3} fill={line.color} />
        <circle cx={b.x} cy={b.y} r={3} fill={line.color} />
        {onRemove && (
          <g className="pointer-events-auto">
            <circle
              cx={b.x + 8}
              cy={b.y - 8}
              r={6}
              fill="#131722"
              stroke={line.color}
              strokeWidth={1}
              style={{ cursor: "pointer" }}
              onClick={() => onRemove("trend", line.id)}
            />
            <text
              x={b.x + 8}
              y={b.y - 5}
              textAnchor="middle"
              fontSize={9}
              fill={line.color}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              ×
            </text>
          </g>
        )}
      </g>
    );
  };

  const renderFib = (fib: FibRetracement) => {
    const a = toXY(candleSeries!, ts, fib.a.time, fib.a.price);
    const b = toXY(candleSeries!, ts, fib.b.time, fib.b.price);
    if (!a || !b) return null;
    const high = fib.direction === "up" ? fib.b.price : fib.a.price;
    const low = fib.direction === "up" ? fib.a.price : fib.b.price;
    const containerW = chart!.chartElement().clientWidth;
    const leftX = Math.min(a.x, b.x);
    const rightX = containerW;
    return (
      <g key={`fib-${fib.id}`} className="pointer-events-none">
        {FIB_LEVELS.map((lvl, i) => {
          const price = low + (high - low) * lvl.r;
          const y = candleSeries!.priceToCoordinate(price);
          if (y === null || !isFinite(y)) return null;
          const isExt = lvl.r > 1 || lvl.r < 0;
          return (
            <g key={i}>
              <line
                x1={leftX}
                y1={y}
                x2={rightX}
                y2={y}
                stroke={fib.color}
                strokeWidth={isExt ? 0.7 : 1}
                strokeDasharray={isExt ? "3,3" : undefined}
                opacity={isExt ? 0.5 : 0.85}
              />
              <rect
                x={leftX - 38}
                y={y - 8}
                width={38}
                height={16}
                fill={fib.color}
                opacity={0.9}
              />
              <text
                x={leftX - 19}
                y={y + 3}
                textAnchor="middle"
                fontSize={10}
                fill="#131722"
                fontWeight={600}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {lvl.label}
              </text>
            </g>
          );
        })}
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={fib.color}
          strokeWidth={1.5}
        />
        <circle cx={a.x} cy={a.y} r={3} fill={fib.color} />
        <circle cx={b.x} cy={b.y} r={3} fill={fib.color} />
        {onRemove && (
          <g className="pointer-events-auto">
            <circle
              cx={b.x + 8}
              cy={b.y - 8}
              r={6}
              fill="#131722"
              stroke={fib.color}
              strokeWidth={1}
              style={{ cursor: "pointer" }}
              onClick={() => onRemove("fib", fib.id)}
            />
            <text
              x={b.x + 8}
              y={b.y - 5}
              textAnchor="middle"
              fontSize={9}
              fill={fib.color}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              ×
            </text>
          </g>
        )}
      </g>
    );
  };

  const renderLong = (pos: LongPosition) => {
    const e = toXY(candleSeries!, ts, pos.entry.time, pos.entry.price);
    const t = toXY(candleSeries!, ts, pos.target.time, pos.target.price);
    const s = toXY(candleSeries!, ts, pos.stop.time, pos.stop.price);
    if (!e || !t || !s) return null;
    const risk = Math.abs(pos.entry.price - pos.stop.price);
    const reward = Math.abs(pos.target.price - pos.entry.price);
    const rr = risk === 0 ? 0 : reward / risk;
    const pl = (pos.target.price - pos.entry.price) * pos.qty;
    const stopLoss = (pos.entry.price - pos.stop.price) * pos.qty;
    const containerW = chart!.chartElement().clientWidth;
    return (
      <g key={`long-${pos.id}`} className="pointer-events-none">
        {/* Risk zone (red) */}
        <rect
          x={Math.min(e.x, s.x)}
          y={Math.min(e.y, s.y)}
          width={Math.abs(s.x - e.x)}
          height={Math.abs(s.y - e.y)}
          fill="rgba(239, 83, 80, 0.18)"
          stroke="#ef5350"
          strokeWidth={0.8}
          strokeDasharray="2,2"
        />
        {/* Reward zone (green) */}
        <rect
          x={Math.min(e.x, t.x)}
          y={Math.min(t.y, e.y)}
          width={Math.abs(t.x - e.x)}
          height={Math.abs(t.y - e.y)}
          fill="rgba(38, 166, 154, 0.18)"
          stroke="#26a69a"
          strokeWidth={0.8}
          strokeDasharray="2,2"
        />
        {/* Entry/target/stop horizontal lines (extended right) */}
        {[
          { y: e.y, color: pos.color, label: `Entry ${formatPrice(pos.entry.price)}` },
          { y: t.y, color: "#26a69a", label: `TP ${formatPrice(pos.target.price)}` },
          { y: s.y, color: "#ef5350", label: `SL ${formatPrice(pos.stop.price)}` },
        ].map((line, i) => (
          <g key={i}>
            <line
              x1={e.x}
              y1={line.y}
              x2={containerW}
              y2={line.y}
              stroke={line.color}
              strokeWidth={1}
              strokeDasharray="3,3"
              opacity={0.85}
            />
            <rect x={containerW - 80} y={line.y - 8} width={76} height={16} fill={line.color} opacity={0.95} />
            <text
              x={containerW - 42}
              y={line.y + 3}
              textAnchor="middle"
              fontSize={9}
              fill="#ffffff"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {line.label}
            </text>
          </g>
        ))}
        {/* P/L + R:R label */}
        <rect x={e.x - 4} y={e.y - 26} width={148} height={20} fill="#131722" stroke={pos.color} strokeWidth={1} />
        <text
          x={e.x + 2}
          y={e.y - 12}
          fontSize={10}
          fill={pos.color}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          R:R {rr.toFixed(2)} · P/L {pl >= 0 ? "+" : ""}
          {formatPrice(pl)} · SL {formatPrice(stopLoss)} · Q {pos.qty}
        </text>
        {onRemove && (
          <g className="pointer-events-auto">
            <circle
              cx={e.x + 8}
              cy={e.y - 26}
              r={6}
              fill="#131722"
              stroke={pos.color}
              strokeWidth={1}
              style={{ cursor: "pointer" }}
              onClick={() => onRemove("long", pos.id)}
            />
            <text
              x={e.x + 8}
              y={e.y - 23}
              textAnchor="middle"
              fontSize={9}
              fill={pos.color}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              ×
            </text>
          </g>
        )}
      </g>
    );
  };

  const renderBrush = (stroke: BrushStroke) => {
    const d = pointsToPathD(candleSeries!, ts, stroke.points);
    if (!d) return null;
    const isFirst = stroke.id === "preview";
    return (
      <g key={`brush-${stroke.id}`} className="pointer-events-none">
        <path
          d={d}
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={isFirst ? 0.85 : 1}
        />
        {onRemove && stroke.points.length > 0 && (
          <g className="pointer-events-auto">
            <circle
              cx={toXY(candleSeries!, ts, stroke.points[stroke.points.length - 1].time, stroke.points[stroke.points.length - 1].price)?.x ?? 0}
              cy={(toXY(candleSeries!, ts, stroke.points[stroke.points.length - 1].time, stroke.points[stroke.points.length - 1].price)?.y ?? 0) - 8}
              r={6}
              fill="#131722"
              stroke={stroke.color}
              strokeWidth={1}
              style={{ cursor: "pointer" }}
              onClick={() => onRemove("brush", stroke.id)}
            />
          </g>
        )}
      </g>
    );
  };

  const renderPreview = () => {
    if (!preview) return null;
    if (preview.kind === "trend") {
      return renderTrend(
        {
          id: "preview",
          symbol: "",
          a: preview.a,
          b: preview.b,
          color: preview.color,
          width: 1.5,
        },
        true,
      );
    }
    if (preview.kind === "fib") {
      return renderFib({
        id: "preview",
        symbol: "",
        a: preview.a,
        b: preview.b,
        color: preview.color,
        direction: preview.b.price >= preview.a.price ? "up" : "down",
      });
    }
    if (preview.kind === "long") {
      const cur = preview.cursor;
      if (preview.phase === "entry_target") {
        return renderLong({
          id: "preview",
          symbol: "",
          entry: preview.entry,
          target: cur,
          stop: { time: cur.time, price: preview.entry.price - (cur.price - preview.entry.price) * 0.5 },
          qty: preview.qty,
          color: preview.color,
        });
      }
      // phase === "stop" -> entry + target set, cursor = stop
      return renderLong({
        id: "preview",
        symbol: "",
        entry: preview.entry,
        target: preview.target ?? preview.entry,
        stop: cur,
        qty: preview.qty,
        color: preview.color,
      });
    }
    if (preview.kind === "brush") {
      return renderBrush({
        id: "preview",
        symbol: "",
        points: preview.points,
        color: preview.color,
        width: preview.width,
      });
    }
    return null;
  };

  // Render del texto (DOM, no SVG) — todos los textNotes se montan sobre
  // un div wrapper fuera del SVG porque contentEditable no funciona dentro
  // del namespace SVG. Posición absolute respecto al contenedor del chart.
  const textElements = textNotes.map((note) => {
    const a = toXY(candleSeries!, ts, note.anchor.time, note.anchor.price);
    if (!a) return null;
    return (
      <div
        key={`text-${note.id}`}
        style={{
          position: "absolute",
          left: a.x,
          top: a.y - note.fontSize,
          color: note.color,
          fontSize: note.fontSize,
          pointerEvents: "auto",
        }}
        className="group absolute z-20 min-w-[40px] max-w-[300px] cursor-move select-text whitespace-pre-wrap break-words rounded bg-tv-bg/70 px-1 leading-tight ring-1 ring-tv-border/40"
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => {
          const text = e.currentTarget.textContent ?? "";
          if (onUpdateText) onUpdateText(note.id, text);
          if (text.trim() === "" && onRemove) onRemove("text", note.id);
        }}
        onKeyDown={(e) => {
          // Escape sin guardar = revertir; Enter inserta salto de línea.
          if (e.key === "Escape") {
            e.preventDefault();
            (e.target as HTMLDivElement).blur();
          }
        }}
      >
        {note.text}
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove("text", note.id);
            }}
            className="absolute -right-2 -top-2 hidden h-4 w-4 items-center justify-center rounded-full bg-tv-panel text-[10px] text-tv-text group-hover:flex group-hover:text-tv-red"
            aria-label="Borrar texto"
          >
            ×
          </button>
        )}
      </div>
    );
  });

  const previewText = (() => {
    if (!preview || preview.kind !== "text") return null;
    const a = toXY(candleSeries!, ts, preview.anchor.time, preview.anchor.price);
    if (!a) return null;
    return (
      <div
        style={{
          position: "absolute",
          left: a.x,
          top: a.y - preview.fontSize,
          color: preview.color,
          fontSize: preview.fontSize,
          pointerEvents: "none",
        }}
        className="absolute z-20 whitespace-pre-wrap rounded bg-tv-bg/70 px-1 leading-tight ring-1 ring-tv-border/40"
      >
        {preview.text}
      </div>
    );
  })();

  return (
    <div key={renderKey} className="pointer-events-none absolute inset-0 z-20 h-full w-full">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ overflow: "visible" }}
      >
        {trendLines.map((l) => renderTrend(l))}
        {fibRetracements.map((f) => renderFib(f))}
        {longPositions.map((p) => renderLong(p))}
        {brushStrokes.map((s) => renderBrush(s))}
        {renderPreview()}
      </svg>
      {textElements}
      {previewText}
    </div>
  );
}

void formatVolume;
