"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";
import {
  getDescriptor,
  type IndicatorDescriptor,
  type ParamSpec,
  type ThresholdLine,
} from "@/lib/indicators/catalog";
import { defaultColor } from "@/lib/indicators/catalog";
export type DrawingTool =
  | "cursor"
  | "hline"
  | "trend"
  | "fib"
  | "measure"
  | "long_pos"
  | "text"
  | "brush"
  | "zoom_in"
  | "zoom_out"
  | "eraser";

export interface PriceLine {
  id: string;
  symbol: string;
  price: number;
}

/** Punto anclado a (time, price) en el chart. Re-usable para todos los dibujos
 * que necesitan dos endpoints (línea de tendencia, fibonacci, posición larga). */
export interface DrawingPoint {
  time: number;
  price: number;
}

/** Línea de tendencia: dos puntos. Dibuja una recta extrapolada. */
export interface TrendLine {
  id: string;
  symbol: string;
  a: DrawingPoint;
  b: DrawingPoint;
  color: string;
  width: number;
}

/** Retracement de Fibonacci entre A (swing low) y B (swing high).
 * Niveles standard TV: 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618. */
export interface FibRetracement {
  id: string;
  symbol: string;
  a: DrawingPoint;
  b: DrawingPoint;
  color: string;
  /** true si A es el swing low y B es el swing high (trend up). */
  direction: "up" | "down";
}

/** Posición larga (entry, target, stop, qty). Calcula P/L y R:R. */
export interface LongPosition {
  id: string;
  symbol: string;
  entry: DrawingPoint;
  target: DrawingPoint;
  stop: DrawingPoint;
  qty: number;
  color: string;
}

/** Nota de texto anclada a (time, price). El usuario la arrastra de su
 * posición inicial. Editable in-place (contentEditable en el overlay). */
export interface TextNote {
  id: string;
  symbol: string;
  anchor: DrawingPoint;
  text: string;
  color: string;
  /** tamaño de fuente en px. */
  fontSize: number;
}

/** Trazo libre del pincel. Serie de puntos (time, price) por los que
 * pasó el cursor mientras el mouse estaba apretado. Se renderiza como
 * un <path> SVG con stroke. */
export interface BrushStroke {
  id: string;
  symbol: string;
  points: DrawingPoint[];
  color: string;
  width: number;
}

/**
 * Una instancia activa de un indicador sobre el chart.
 * Múltiples instancias del mismo `type` con distintos params/colores
 * están soportadas (e.g. EMA 9 + EMA 21 + EMA 100).
 */
export interface IndicatorInstance {
  /** id estable único generado al añadir */
  id: string;
  /** tipo de indicador (key del catálogo, e.g. "ema", "rsi") */
  type: string;
  /** nombre a mostrar (copia del catálogo en el momento de creación) */
  name: string;
  /** pane destino: "overlay" | "separate" | "volume" (copia del catálogo) */
  pane: IndicatorDescriptor["pane"];
  /**
   * Parámetros concretos (e.g. { period: 21, side: "right" }).
   * Los valores numéricos son `number`; los `select` son `string`.
   */
  params: Record<string, number | string | boolean>;
  /** colores por serie key (e.g. { value: "#2962ff" }) */
  colors: Record<string, string>;
  /** grosor de línea por serie (1-4) — si no está, usa default del catálogo */
  lineWidths?: Record<string, number>;
  /** estilo de línea por serie (solid/dashed/dotted) — si no está, usa default */
  lineStyles?: Record<string, "solid" | "dashed" | "dotted">;
  /** series ocultas individualmente por key (e.g. { plusDI: true }) */
  seriesHidden?: Record<string, boolean>;
  /** false = pill visible pero todas las series ocultas (eye toggle global) */
  hidden: boolean;
  /** orden visual (mayor = más arriba en lista de pills) */
  order: number;
  /**
   * Si la instancia pane==="separate" y este campo es un número (>=1),
   * el indicador se dibuja en el mismo pane que la instancia con este paneIndex
   * en vez de su propio pane nuevo. Permite superponer ADX sobre Squeeze, etc.
   * El usuario lo cambia desde el diálogo de settings ("Superponer sobre pane N").
   */
  overlayPaneIndex?: number;
  /**
   * Líneas de umbral adicionales configurables por el usuario para esta instancia.
   * Ej: ADX con threshold=23 dibuja una línea horizontal punteada en y=23.
   * Cada entrada define { value, color, style, width, label }.
   */
  thresholdLines?: ThresholdLine[];
}

/** @deprecated usar ThresholdLine re-exportado desde catalog */
export type { ThresholdLine };

export const DEFAULT_WATCHLIST = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
];

function nextId(): string {
  return (
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );
}

/** construye params defaults a partir del descriptor */
export function defaultParams(d: IndicatorDescriptor): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const p of d.params) out[p.key] = p.default;
  return out;
}

/** construye colores defaults a partir del descriptor (uno por serie) */
export function defaultColors(d: IndicatorDescriptor): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of d.series) out[s.key] = s.color ?? defaultColor(d.type);
  return out;
}

/**
 * Crea una nueva instancia del indicador del tipo dado.
 * `params`, `colors`, `lineWidths`, `lineStyles`, `seriesHidden` opcionales sobreescriben los defaults.
 */
export function createInstance(
  type: string,
  overrides?: {
    params?: Partial<Record<string, number | string | boolean>>;
    colors?: Partial<Record<string, string>>;
    lineWidths?: Partial<Record<string, number>>;
    lineStyles?: Partial<Record<string, "solid" | "dashed" | "dotted">>;
    seriesHidden?: Partial<Record<string, boolean>>;
    order?: number;
    overlayPaneIndex?: number;
    thresholdLines?: ThresholdLine[];
  },
): IndicatorInstance {
  const d = getDescriptor(type);
  const params: Record<string, number | string | boolean> = { ...defaultParams(d) };
  const colors: Record<string, string> = { ...defaultColors(d) };
  const lineWidths: Record<string, number> = {};
  const lineStyles: Record<string, "solid" | "dashed" | "dotted"> = {};
  const seriesHidden: Record<string, boolean> = {};
  for (const s of d.series) {
    lineWidths[s.key] = s.defaultWidth ?? (s.shape === "line-thick" ? 2 : 1);
    lineStyles[s.key] = s.defaultStyle ?? "solid";
    seriesHidden[s.key] = s.defaultHidden ?? false;
  }
  if (overrides?.params) {
    for (const [k, v] of Object.entries(overrides.params)) {
      if (v !== undefined) params[k] = v;
    }
  }
  if (overrides?.colors) {
    for (const [k, v] of Object.entries(overrides.colors)) {
      if (v !== undefined) colors[k] = v;
    }
  }
  if (overrides?.lineWidths) {
    for (const [k, v] of Object.entries(overrides.lineWidths)) {
      if (v !== undefined) lineWidths[k] = v;
    }
  }
  if (overrides?.lineStyles) {
    for (const [k, v] of Object.entries(overrides.lineStyles)) {
      if (v !== undefined) lineStyles[k] = v;
    }
  }
  if (overrides?.seriesHidden) {
    for (const [k, v] of Object.entries(overrides.seriesHidden)) {
      if (v !== undefined) seriesHidden[k] = v;
    }
  }
  // Threshold lines: clonamos las defaults del descriptor y aplicamos overrides
  let thresholdLines: ThresholdLine[] | undefined;
  if (d.defaultThresholdLines && d.defaultThresholdLines.length > 0) {
    thresholdLines = d.defaultThresholdLines.map((tl) => ({ ...tl }));
  }
  if (overrides?.thresholdLines) {
    thresholdLines = overrides.thresholdLines.map((tl) => ({ ...tl }));
  }
  return {
    id: nextId(),
    type,
    name: d.name,
    pane: d.pane,
    params,
    colors,
    lineWidths,
    lineStyles,
    seriesHidden,
    hidden: false,
    order: overrides?.order ?? Date.now(),
    overlayPaneIndex: overrides?.overlayPaneIndex,
    thresholdLines,
  };
}

interface ChartState {
  symbol: string;
  timeframe: Timeframe;
  instances: IndicatorInstance[];
  watchlist: string[];

  // Ephemeral UI state (not persisted)
  tool: DrawingTool;
  priceLines: PriceLine[];
  trendLines: TrendLine[];
  fibRetracements: FibRetracement[];
  longPositions: LongPosition[];
  textNotes: TextNote[];
  brushStrokes: BrushStroke[];
  symbolDialogOpen: boolean;
  /** id de instancia cuyo diálogo de settings está abierto (null = cerrado) */
  settingsTargetId: string | null;
  /** true si se está abriendo el diálogo de "Add Indicator" */
  addDialogOpen: boolean;

  // Actions
  setSymbol: (s: string) => void;
  setTimeframe: (t: Timeframe) => void;

  addIndicator: (type: string, overrides?: {
    params?: Partial<Record<string, number | string | boolean>>;
    colors?: Partial<Record<string, string>>;
    overlayPaneIndex?: number;
  }) => string;
  removeIndicator: (id: string) => void;
  updateIndicator: (id: string, patch: Partial<Omit<IndicatorInstance, "id" | "type">>) => void;
  /** sube/baja el orden visual de una instancia */
  moveIndicator: (id: string, dir: "up" | "down") => void;
  toggleHidden: (id: string) => void;
  setIndicatorParams: (id: string, params: Record<string, number | string | boolean>) => void;
  setIndicatorColor: (id: string, seriesKey: string, color: string) => void;

  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;

  setTool: (t: DrawingTool) => void;
  addPriceLine: (price: number, symbol: string) => void;
  clearPriceLines: (symbol?: string) => void;

  // Tendencia / Fib / Posición larga / Texto / Pincel
  addTrendLine: (line: Omit<TrendLine, "id">) => string;
  removeTrendLine: (id: string) => void;
  addFibRetracement: (fib: Omit<FibRetracement, "id">) => string;
  removeFibRetracement: (id: string) => void;
  addLongPosition: (pos: Omit<LongPosition, "id">) => string;
  removeLongPosition: (id: string) => void;
  addTextNote: (note: Omit<TextNote, "id">) => string;
  updateTextNote: (id: string, patch: Partial<Omit<TextNote, "id" | "symbol">>) => void;
  removeTextNote: (id: string) => void;
  addBrushStroke: (stroke: Omit<BrushStroke, "id">) => string;
  removeBrushStroke: (id: string) => void;
  /** Borra todos los dibujos del símbolo dado (hlines, trend, fib, long,
   *  text, brush). */
  clearAllDrawings: (symbol: string) => void;

  setSymbolDialogOpen: (v: boolean) => void;
  setSettingsTargetId: (id: string | null) => void;
  setAddDialogOpen: (v: boolean) => void;
}

function seedInstances(): IndicatorInstance[] {
  // Layout inicial razonable: EMA 20, EMA 50, RSI 14, Volumen
  return [
    createInstance("ema", { params: { period: 20 }, colors: { value: "#ffb74d" } }),
    createInstance("ema", { params: { period: 50 }, colors: { value: "#2962ff" } }),
    createInstance("rsi"),
    createInstance("volume"),
  ];
}

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      symbol: "BTCUSDT",
      timeframe: "15m" as Timeframe,      instances: seedInstances(),
      watchlist: DEFAULT_WATCHLIST,

      tool: "cursor",
      priceLines: [],
      trendLines: [],
      fibRetracements: [],
      longPositions: [],
      textNotes: [],
      brushStrokes: [],
      symbolDialogOpen: false,
      settingsTargetId: null,
      addDialogOpen: false,

      setSymbol: (symbol) => set({ symbol }),
      setTimeframe: (timeframe) => set({ timeframe }),

      addIndicator: (type, overrides) => {
        const inst = createInstance(type, overrides);
        set((s) => ({ instances: [...s.instances, inst] }));
        return inst.id;
      },

      removeIndicator: (id) =>
        set((s) => ({
          instances: s.instances.filter((i) => i.id !== id),
          settingsTargetId: s.settingsTargetId === id ? null : s.settingsTargetId,
        })),

      updateIndicator: (id, patch) =>
        set((s) => ({
          instances: s.instances.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })),

      moveIndicator: (id, dir) =>
        set((s) => {
          const sorted = [...s.instances].sort((a, b) => b.order - a.order);
          const idx = sorted.findIndex((i) => i.id === id);
          if (idx === -1) return s;
          const swap = dir === "up" ? idx - 1 : idx + 1;
          if (swap < 0 || swap >= sorted.length) return s;
          const a = sorted[idx];
          const b = sorted[swap];
          const tmp = a.order;
          a.order = b.order;
          b.order = tmp;
          return { instances: [...s.instances] };
        }),

      toggleHidden: (id) =>
        set((s) => ({
          instances: s.instances.map((i) =>
            i.id === id ? { ...i, hidden: !i.hidden } : i,
          ),
        })),

      setIndicatorParams: (id, params) =>
        set((s) => ({
          instances: s.instances.map((i) =>
            i.id === id ? { ...i, params: { ...i.params, ...params } } : i,
          ),
        })),

      setIndicatorColor: (id, seriesKey, color) =>
        set((s) => ({
          instances: s.instances.map((i) =>
            i.id === id ? { ...i, colors: { ...i.colors, [seriesKey]: color } } : i,
          ),
        })),

      addToWatchlist: (s) =>
        set((state) => ({
          watchlist: state.watchlist.includes(s)
            ? state.watchlist
            : [...state.watchlist, s],
        })),

      removeFromWatchlist: (s) =>
        set((state) => ({
          watchlist: state.watchlist.filter((x) => x !== s),
        })),

      setTool: (tool) => set({ tool }),

      addPriceLine: (price, symbol) =>
        set((state) => ({
          priceLines: [
            ...state.priceLines,
            {
              id: nextId(),
              symbol,
              price,
            },
          ],
        })),

      clearPriceLines: (symbol) =>
        set((state) => ({
          priceLines: symbol
            ? state.priceLines.filter((p) => p.symbol !== symbol)
            : [],
        })),

      // ── Trend lines ─────────────────────────────────────────────────
      addTrendLine: (line) => {
        const id = nextId();
        set((state) => ({
          trendLines: [...state.trendLines, { ...line, id }],
        }));
        return id;
      },
      removeTrendLine: (id) =>
        set((state) => ({
          trendLines: state.trendLines.filter((t) => t.id !== id),
        })),

      // ── Fibonacci retracements ─────────────────────────────────────
      addFibRetracement: (fib) => {
        const id = nextId();
        set((state) => ({
          fibRetracements: [...state.fibRetracements, { ...fib, id }],
        }));
        return id;
      },
      removeFibRetracement: (id) =>
        set((state) => ({
          fibRetracements: state.fibRetracements.filter((f) => f.id !== id),
        })),

      // ── Long positions ─────────────────────────────────────────────
      addLongPosition: (pos) => {
        const id = nextId();
        set((state) => ({
          longPositions: [...state.longPositions, { ...pos, id }],
        }));
        return id;
      },
      removeLongPosition: (id) =>
        set((state) => ({
          longPositions: state.longPositions.filter((p) => p.id !== id),
        })),

      // ── Text notes ─────────────────────────────────────────────────
      addTextNote: (note) => {
        const id = nextId();
        set((state) => ({
          textNotes: [...state.textNotes, { ...note, id }],
        }));
        return id;
      },
      updateTextNote: (id, patch) =>
        set((state) => ({
          textNotes: state.textNotes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        })),
      removeTextNote: (id) =>
        set((state) => ({
          textNotes: state.textNotes.filter((n) => n.id !== id),
        })),

      // ── Brush strokes (pincel) ─────────────────────────────────────
      addBrushStroke: (stroke) => {
        const id = nextId();
        set((state) => ({
          brushStrokes: [...state.brushStrokes, { ...stroke, id }],
        }));
        return id;
      },
      removeBrushStroke: (id) =>
        set((state) => ({
          brushStrokes: state.brushStrokes.filter((s) => s.id !== id),
        })),

      clearAllDrawings: (symbol) =>
        set((state) => ({
          priceLines: state.priceLines.filter((p) => p.symbol !== symbol),
          trendLines: state.trendLines.filter((t) => t.symbol !== symbol),
          fibRetracements: state.fibRetracements.filter((f) => f.symbol !== symbol),
          longPositions: state.longPositions.filter((p) => p.symbol !== symbol),
          textNotes: state.textNotes.filter((n) => n.symbol !== symbol),
          brushStrokes: state.brushStrokes.filter((s) => s.symbol !== symbol),
        })),

      setSymbolDialogOpen: (symbolDialogOpen) => set({ symbolDialogOpen }),
      setSettingsTargetId: (settingsTargetId) => set({ settingsTargetId }),
      setAddDialogOpen: (addDialogOpen) => set({ addDialogOpen }),
    }),
    {
      name: "tv-gratis-chart-state-v3",
      version: 4,
      partialize: (s) => ({
        symbol: s.symbol,
        timeframe: s.timeframe,
        instances: s.instances,
        watchlist: s.watchlist,
      }),
      // si cargamos estado de versión vieja (listados de indicadores fijos),
      // migramos a instancias dinámicas seedeadas.
      migrate: (_persisted: unknown, version: number) => {
        if (version < 2) {
          return {
            symbol: "BTCUSDT",
            timeframe: "15m",
            instances: seedInstances(),
            watchlist: DEFAULT_WATCHLIST,
          };
        }
        // version 2 → 3 (y 3 → 4): saneamiento de instancias antiguas. El
        // store v2 se guardó cuando algunos indicadores nuevos (squeeze,
        // aroon, etc.) tenían params distintos o incompletos. La versión 4
        // añade params nuevos al VPR (volume, rowSize, statusLine) — esos
        // keys faltarán en instancias persistidas y se rellenan acá con los
        // defaults del catálogo actual. Sin esto, el diálogo de settings
        // recibe `undefined` en esos params y los `<select>` se ven vacíos
        // (ej: "Volume" sin valor seleccionado, lo que se reportaba como
        // "no se ve la opción Volume").
        const p = _persisted as Partial<ChartState> | undefined;
        if (!p || !Array.isArray(p.instances)) return p;
        p.instances = p.instances.map((inst) => {
          let d: IndicatorDescriptor | null = null;
          try {
            d = getDescriptor(inst.type);
          } catch {
            return inst; // type desconocido
          }
          const params: Record<string, number | string | boolean> = { ...inst.params };
          for (const ps of d.params) {
            if (params[ps.key] === undefined) {
              params[ps.key] = ps.default;
            } else if (typeof ps.default === "number" && typeof params[ps.key] === "number") {
              if (!isFinite(params[ps.key] as number)) params[ps.key] = ps.default;
            }
          }
          const colors: Record<string, string> = { ...inst.colors };
          for (const s of d.series) {
            if (!colors[s.key]) colors[s.key] = s.color;
          }
          // Saneo de seriesHidden (no se persistía en versiones anteriores).
          // Recorremos el descriptor y rellenamos false/true según defaultHidden
          // cuando falten entries. Sin esto, una instancia vieja con
          // seriesHidden===undefined hace que el pill muestre series marcadas
          // como defaultHidden (ej: +DI/-DI del ADX) — bug reportado por el
          // usuario ("veo -1.84 y 5.25 sobre el ADX").
          const seriesHidden: Record<string, boolean> = { ...(inst.seriesHidden ?? {}) };
          for (const s of d.series) {
            if (seriesHidden[s.key] === undefined) {
              seriesHidden[s.key] = s.defaultHidden ?? false;
            }
          }
          return { ...inst, params, colors, seriesHidden };
        });
        return p;
      },
    },
  ),
);

/** helpers de export para conveniencia de la UI */
export { getDescriptor };
export type { IndicatorDescriptor, ParamSpec };
