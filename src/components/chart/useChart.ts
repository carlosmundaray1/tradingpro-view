"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from "lightweight-charts";
import { getDescriptor, type SeriesSpec } from "@/lib/indicators/catalog";
import {
  computeIndicator,
  type IndicatorResult,
  type IndicatorPoint,
} from "@/lib/indicators";
import { useChartStore, type IndicatorInstance } from "@/lib/store/chart-store";
import { getSymbolPrecision, getSymbolMinMove, subscribeSymbolsCacheReady, areSymbolsCached } from "@/lib/binance/rest";
import { VolumeProfilePrimitive } from "@/components/chart/volumeProfilePrimitive";
import type { PreviewDrawing } from "@/components/chart/DrawingOverlay";

const TV_COLORS = {
  bg: "#131722",
  panel: "#1e222d",
  border: "#2a2e39",
  text: "#d1d4dc",
  textMuted: "#787b86",
  green: "#26a69a",
  red: "#ef5350",
  blue: "#2962ff",
  // Color exacto del label del último precio en TradingView Pro (paleta
  // "TV Charting Library" dark theme). Naranja tirando a rojo / coral, elegido
  // porque sobre el fondo oscuro #131722 el precio blanco resalta con máximo
  // contraste, igual que en tradingview.com/chart.
  orange: "#FF6B57",
  grid: "#1e222d",
};

type SeriesApi = ISeriesApi<"Line" | "Histogram" | "Candlestick">;

interface InstanceSeries {
  instanceId: string;
  paneIndex: number;
  series: Record<string, SeriesApi>;
  instanceParams: string;
  instanceColors: string;
  instanceLineWidths: string;
  instanceLineStyles: string;
  instanceSeriesHidden: string;
  instanceThresholdLines: string;
  /** Tracks which candle version this instance was last fed with.
   *  When candles change (candlesVersion increments), force re-push of all instances. */
  candleVersion: number;
}

export interface IndicatorLastValue {
  values: Record<string, number | undefined>;
  label: string;
}

interface HoverInfo {
  o: number;
  h: number;
  l: number;
  c: number;
  time: number;
  pct: number;
}
interface PaneOffset {
  top: number;
  height: number;
  /** Ancho en píxeles del priceScale DERECHO de este pane.
   *  Sirve para que las pills de los indicadores no sean tapadas por
   *  los labels del eje (0/20/40 del ADX, precio 100k del BTC, etc.).
   *  Si el eje derecho está oculto (pane 0 cuando el precio usa izquierda)
   *  o el pane no existe, vale 0.
   */
  rightAxisWidth: number;
}
interface MeasurePoint {
  time: number;
  price: number;
}
type MeasureState = {
  phase: "idle" | "placing" | "done";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
};
const INITIAL_MEASURE: MeasureState = { phase: "idle", a: null, b: null };

export interface MeasureCoords {
  aX: number;
  aY: number;
  bX: number;
  bY: number;
  priceDiff: number;
  pctChange: number;
  bars: number;
  volume: number;
  durationText: string;
  isUp: boolean;
  isPreview: boolean;
}

interface UseChartReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  chartRef: React.RefObject<IChartApi | null>;
  candleSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>;
  candlesRef: React.RefObject<Candle[]>;
  hover: HoverInfo | null;
  lastPrice: { value: number; pct: number } | null;
  setLastPrice: (v: { value: number; pct: number } | null) => void;
  paneOffsets: PaneOffset[];
  lastValues: Record<string, IndicatorLastValue>;
  /** Coordenadas (Y dentro del pane) de cada threshold line, para renderizar
   *  el texto completo en el DOM — ver `PriceChart.tsx`. */
  thresholdLabels: Array<{
    instanceId: string;
    paneIndex: number;
    color: string;
    text: string;
    y: number;
  }>;
  measure: MeasureState;
  setMeasure: React.Dispatch<React.SetStateAction<MeasureState>>;
  measureCoords: MeasureCoords | null;
  /** Preview del dibujo en proceso (mientras el usuario está colocando antes
   * del click final que lo persiste). */
  preview: PreviewDrawing | null;
  /** Versión que sube cada vez que el rango visible cambia (scroll/zoom) —
   * el componente externo DrawingOverlay lo usa como key para re-computar
   * las coords de todos los drawings persistidos. */
  drawingsRecalcTick: number;
  /** Drawings persistidos (filtra el store por símbolo en PriceChart). */
  trendLines: import("@/lib/store/chart-store").TrendLine[];
  fibRetracements: import("@/lib/store/chart-store").FibRetracement[];
  longPositions: import("@/lib/store/chart-store").LongPosition[];
  textNotes: import("@/lib/store/chart-store").TextNote[];
  brushStrokes: import("@/lib/store/chart-store").BrushStroke[];
  /** Handlers de borrado individual (botón × en el overlay). */
  removeTrendLine: (id: string) => void;
  removeFibRetracement: (id: string) => void;
  removeLongPosition: (id: string) => void;
  removeTextNote: (id: string) => void;
  removeBrushStroke: (id: string) => void;
  /** Actualiza el texto de una nota in-place (editado desde el overlay). */
  updateTextNote: (id: string, text: string) => void;
  /** Llamar después de cargar/actualizar las velas históricas para forzar
   *  que los indicadores se recalculen. Ver bug fix de Ctrl+Shift+R. */
  notifyCandlesChanged: () => void;
  /** Número reactivo que incrementa cada vez que notifyCandlesChanged() se
   *  llama. Permite que effects externos (ej: scroll-infinito en
   *  PriceChart) reaccionen a las nuevas velas cargadas. */
  candlesVersion: number;
}

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function useChart(symbol: string, _timeframe: string): UseChartReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const instanceSeriesRef = useRef<Map<string, InstanceSeries>>(new Map());
  const candlesRef = useRef<Candle[]>([]);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());
  const measureRef = useRef<MeasureState>(INITIAL_MEASURE);
  // Volume Profile primitives por instanceId. El cálculo del VPVR se dibuja
  // como un ISeriesPrimitive sobre el candleSeries (no como series estándar),
  // por eso se maneja ad-hoc, fuera del flujo de addSeriesForShape/pushResult.
  const vprPrimitivesRef = useRef<Map<string, VolumeProfilePrimitive>>(new Map());
  // Handler del timeScale para recalcular el vpr cuando el usuario hace
  // scroll o zoom (la visible range cambia). Se subscribe en el effect de
  // creación del chart y se actualiza desde el reconciler.
  const vprRecalcRef = useRef<(() => void) | null>(null);
  // Handler del timeScale para recalcular las Y de los threshold labels
  // cuando el usuario hace scroll o zoom en el eje de tiempo (la visible
  // range cambia, los precios visibles se re-mapean — las Y del threshold
  // ya no son las mismas).
  const thresholdRecalcRef = useRef<(() => void) | null>(null);
  // Cantidad de panes vistos en la última pasada del effect de reconcile.
  // Sirve para sólo aplicar stretch factors default cuando la cantidad de
  // panes cambió — no en cada pasada, porque eso pisaría el resize manual
  // arrastrando el separador del pane.
  const stretchFactorsRef = useRef<number>(0);
  // ResizeObserver que escucha cambios de altura individual de cada pane
  // (gatillado por el drag del separador built-in de lightweight-charts v5).
  // Es recreado en el effect de create chart, y re-observa los pane elements
  // cada vez que cambia la cantidad de panes dentro del reconcile effect.
  const paneResizeObserverRef = useRef<ResizeObserver | null>(null);

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [lastPrice, setLastPrice] = useState<{ value: number; pct: number } | null>(null);
  const [paneOffsets, setPaneOffsets] = useState<PaneOffset[]>([]);
  const [lastValues, setLastValues] = useState<Record<string, IndicatorLastValue>>({});
  // Coordenadas (Y dentro del pane) de las líneas threshold, para renderizar
  // el label completo "threshold 23.00" como un div DOM sobre el eje horizontal.
  // lightweight-charts v5 no soporta mover el `title` del priceLine a otro lado
  // ni ampliar su ancho (siempre se trunca al ancho disponible antes del
  // axisLabel: "thres..."), así que lo reimprimimos nosotros en el DOM con el
  // texto completo, a la altura exacta del threshold.
  const [thresholdLabels, setThresholdLabels] = useState<
    Array<{ instanceId: string; paneIndex: number; color: string; text: string; y: number }>
  >([]);
  const [measure, setMeasure] = useState<MeasureState>(INITIAL_MEASURE);
  const [measureCoords, setMeasureCoords] = useState<MeasureCoords | null>(null);
  // Tick que sube cada vez que el visible range cambia (scroll / zoom / resize)
  // y el `DrawingOverlay` lo usa como `key` para forzar re-computar las coords
  // de los drawings persistidos. También sube cuando las velas se cargan.
  const [drawingsRecalcTick, setDrawingsRecalcTick] = useState(0);
  // Número reactivo que se incrementa cada vez que `candlesRef.current` se
  // reescribe (reload, cambio de símbolo, refresh del navegador). El effect de
  // reconcile de instancias depende de este número, así cuando las velas
  // finalmente llegan, los datos recalculados de los indicadores se vuelven a
  // pushear a las series.
  // Sin esto, tras Ctrl+Shift+R las instances ya existen en el store persistedido
  // pero las velas no llegaron todavía cuando el effect se ejecutó => el chart
  // queda con series vacías y los indicadores "desaparecen".
  const [candlesVersion, setCandlesVersion] = useState(0);
  const notifyCandlesChanged = useCallback(() => {
    setCandlesVersion((v) => v + 1);
    setDrawingsRecalcTick((t) => t + 1);
  }, []);

  // Flag que pasa a true cuando el cache de símbolos de Binance (preload de
  // exchangeInfo hecho en page.tsx) está listo. Lo usamos para forzar que el
  // effect de priceFormat re-aplique el precision real una vez que el cache
  // pasó de null → lleno (caso: primer render del chart se ejecuta antes del
  // fetch exchangeInfo → getSymbolPrecision retornaba 2 como fallback).
  const [symbolsReady, setSymbolsReady] = useState<boolean>(areSymbolsCached());
  useEffect(() => {
    if (symbolsReady) return;
    const unsub = subscribeSymbolsCacheReady(() => setSymbolsReady(true));
    return unsub;
  }, [symbolsReady]);


  const instances = useChartStore((s) => s.instances);
  const tool = useChartStore((s) => s.tool);
  const priceLines = useChartStore((s) => s.priceLines);
  const trendLines = useChartStore((s) => s.trendLines);
  const fibRetracements = useChartStore((s) => s.fibRetracements);
  const longPositions = useChartStore((s) => s.longPositions);
  const textNotes = useChartStore((s) => s.textNotes);
  const brushStrokes = useChartStore((s) => s.brushStrokes);
  const addPriceLine = useChartStore((s) => s.addPriceLine);
  const addTrendLine = useChartStore((s) => s.addTrendLine);
  const addFibRetracement = useChartStore((s) => s.addFibRetracement);
  const addLongPosition = useChartStore((s) => s.addLongPosition);
  const addTextNote = useChartStore((s) => s.addTextNote);
  const updateTextNote = useChartStore((s) => s.updateTextNote);
  const addBrushStroke = useChartStore((s) => s.addBrushStroke);
  const clearAllDrawings = useChartStore((s) => s.clearAllDrawings);
  const removeTrendLine = useChartStore((s) => s.removeTrendLine);
  const removeFibRetracement = useChartStore((s) => s.removeFibRetracement);
  const removeLongPosition = useChartStore((s) => s.removeLongPosition);
  const removeTextNote = useChartStore((s) => s.removeTextNote);
  const removeBrushStroke = useChartStore((s) => s.removeBrushStroke);

  // Preview del dibujo en proceso (antes del click final que lo persiste).
  // trend/fib: 2 clicks (a, b). long_pos: 3 clicks (entry, target, stop).
  // brush: drag (acumula puntos en preview hasta mouseUp). text: 1 click.
  const [preview, setPreview] = useState<PreviewDrawing | null>(null);
  const previewRef = useRef<PreviewDrawing | null>(null);
  const trendColorRef = useRef<string>("#2962ff");
  const fibColorRef = useRef<string>("#f59e0b");
  const longColorRef = useRef<string>("#2962ff");
  const textColorRef = useRef<string>("#f59e0b");
  const brushColorRef = useRef<string>("#2962ff");
  // Ref del trazo activo (mientras el botón está apretado). Cuando se suelta,
  // se persiste en el store y se limpia el preview.
  const brushActiveRef = useRef<boolean>(false);
  // const qtyRef = useRef<number>(1);

  // Refs to read latest state in chart callbacks without resubscribing.
  // React 19 disallows writing ref.current during render; wrap in effect.
  const toolRef = useRef(tool);
  const symbolRef = useRef(symbol);
  useEffect(() => {
    measureRef.current = measure;
    toolRef.current = tool;
    symbolRef.current = symbol;
    previewRef.current = preview;
  });

  const recomputePaneOffsets = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let panes: ReturnType<typeof chart.panes> = [];
    try {
      panes = chart.panes();
    } catch {
      return;
    }
    let top = 0;
    const offsets: PaneOffset[] = panes.map((p) => {
      const h = p.getHeight();
      let rightAxisWidth = 0;
      try {
        // Si el pane fue disposed (ej: pane que se está eliminando en el
        // mismo frame), `width()` lanza "Object is disposed". Capturamos.
        const ps = p.priceScale("right");
        const w = ps.width();
        rightAxisWidth = Number.isFinite(w) && w > 0 ? w : 0;
      } catch {}
      const o = { top, height: h, rightAxisWidth };
      top += h;
      return o;
    });
    setPaneOffsets(offsets);
  }, []);

  // ─── Effect: create chart once ────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: TV_COLORS.bg },
        textColor: TV_COLORS.text,
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
        fontSize: 11,
        panes: {
          enableResize: true,
          separatorColor: TV_COLORS.border,
          separatorHoverColor: TV_COLORS.textMuted,
        },
      },
      grid: {
        vertLines: { color: TV_COLORS.grid },
        horzLines: { color: TV_COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
        horzLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
      },
      rightPriceScale: { borderColor: TV_COLORS.border, textColor: TV_COLORS.textMuted },
      // El eje izquierdo no se muestra por defecto en ningún pane. Se activa
      // por-pane sólo cuando hay un overlay con `ownsOverlayAxis` (ej: ADX
      // superpuesto sobre Squeeze) — en ese caso, el dueño original (Squeeze)
      // se mueve al eje opuesto, y el eje tomado por el overlay queda activo.
      leftPriceScale: { borderColor: TV_COLORS.border, textColor: TV_COLORS.textMuted, visible: false },
      defaultVisiblePriceScaleId: "right",
      timeScale: {
        borderColor: TV_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
      },
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: TV_COLORS.green,
      downColor: TV_COLORS.red,
      borderUpColor: TV_COLORS.green,
      borderDownColor: TV_COLORS.red,
      wickUpColor: TV_COLORS.green,
      wickDownColor: TV_COLORS.red,
      // Línea horizontal del último precio en coral (TV Pro), sin label nativo
      // (vamos a pintar el label custom HTML con precio + countdown juntos).
      priceLineColor: TV_COLORS.orange,
      priceLineStyle: 2,
      lastValueVisible: false,
      priceLineVisible: true,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    chart.subscribeClick((param) => {
      if (!param.point || !candleSeriesRef.current) return;
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (price === null || !isFinite(price)) return;
      const time = param.time != null ? Number(param.time) : NaN;
      const sym = symbolRef.current;
      const tool = toolRef.current;

      // ── hline ──
      if (tool === "hline") {
        addPriceLine(price, sym);
        return;
      }

      // ── measure (2 clicks) ──
      if (tool === "measure") {
        if (!Number.isFinite(time)) return;
        setMeasure((prev) => {
          if (prev.phase === "idle") {
            return { phase: "placing", a: { time, price }, b: { time, price } };
          }
          if (prev.phase === "placing") {
            return { phase: "done", a: prev.a, b: { time, price } };
          }
          return { phase: "placing", a: { time, price }, b: { time, price } };
        });
        return;
      }

      // ── trend line (2 clicks: a, b) ──
      if (tool === "trend") {
        if (!Number.isFinite(time)) return;
        const pv = previewRef.current;
        if (!pv || pv.kind !== "trend") {
          const next: PreviewDrawing = { kind: "trend", a: { time, price }, b: { time, price }, color: trendColorRef.current };
          setPreview(next);
          previewRef.current = next;
        } else {
          addTrendLine({ symbol: sym, a: pv.a, b: { time, price }, color: trendColorRef.current, width: 1.5 });
          setPreview(null);
          previewRef.current = null;
        }
        return;
      }

      // ── fib retracement (2 clicks: A=swing, B=extreme) ──
      if (tool === "fib") {
        if (!Number.isFinite(time)) return;
        const pv = previewRef.current;
        if (!pv || pv.kind !== "fib") {
          const next: PreviewDrawing = { kind: "fib", a: { time, price }, b: { time, price }, color: fibColorRef.current };
          setPreview(next);
          previewRef.current = next;
        } else {
          const direction = price >= pv.a.price ? "up" : "down";
          addFibRetracement({ symbol: sym, a: pv.a, b: { time, price }, color: fibColorRef.current, direction });
          setPreview(null);
          previewRef.current = null;
        }
        return;
      }

      // ── long position (3 clicks: entry, target, stop) ──
      if (tool === "long_pos") {
        if (!Number.isFinite(time)) return;
        const pv = previewRef.current;
        if (!pv || pv.kind !== "long") {
          const next: PreviewDrawing = {
            kind: "long",
            phase: "entry_target",
            entry: { time, price },
            cursor: { time, price },
            color: longColorRef.current,
            qty: 1,
          };
          setPreview(next);
          previewRef.current = next;
        } else if (pv.phase === "entry_target") {
          // segundo click: target
          const next: PreviewDrawing = {
            ...pv,
            phase: "stop",
            target: { time, price },
            cursor: { time, price },
          };
          setPreview(next);
          previewRef.current = next;
        } else {
          // tercer click: stop -> persist
          addLongPosition({
            symbol: sym,
            entry: pv.entry,
            target: pv.target ?? { time, price },
            stop: { time, price },
            qty: pv.qty,
            color: pv.color,
          });
          setPreview(null);
          previewRef.current = null;
        }
        return;
      }

      // ── text click (1 click → crea nota vacía en (time, price)) ──
      if (tool === "text") {
        if (!Number.isFinite(time)) return;
        addTextNote({
          symbol: sym,
          anchor: { time, price },
          text: "Texto",
          color: textColorRef.current,
          fontSize: 14,
        });
        return;
      }

      // ── zoom in / zoom out: aplicar sobre el X donde el usuario clickó ──
      if (tool === "zoom_in" || tool === "zoom_out") {
        const ts = chart.timeScale();
        const bb = chart.priceScale("right");
        void bb;
        try {
          const range = ts.getVisibleLogicalRange();
          if (range) {
            const pointLogical = ts.coordinateToLogical(param.point.x) ?? (range.from + range.to) / 2;
            const span = range.to - range.from;
            const factor = tool === "zoom_in" ? 0.5 : 2;
            const newSpan = Math.max(2, span * factor);
            const left = pointLogical - (newSpan * (pointLogical - range.from)) / span;
            ts.setVisibleLogicalRange({ from: left, to: left + newSpan });
          }
        } catch {}
        return;
      }

      // ── eraser: borra todos los dibujos del símbolo actual ──
      if (tool === "eraser") {
        clearAllDrawings(sym);
        return;
      }
    });

    // ── Pincel (brush): capturamos mousedown/mouseup sobre el chartElement
    //    directo porque `subscribeClick` no dispara en drag y no tenemos un
    //    evento nativo "drag" en lightweight-charts. En mousedown → empezar
    //    trazo. En mousemove (crosshairMove abajo) → añadir puntos. En
    //    mouseup → persistir y limpiar preview.
    const chartEl = chart.chartElement();
    const onPointerDown = (e: PointerEvent) => {
      if (toolRef.current !== "brush") return;
      const cs = candleSeriesRef.current;
      if (!cs) return;
      // lightweight-charts usa coords relativas al canvas del chart. El
      // propio elemento canvas emite pointer events con offsetX/Y relativos
      // al elemento — eso coincide con lo que el chart usa internamente.
      const price = cs.coordinateToPrice(e.offsetY);
      const timeNum = (() => {
        const t = chart.timeScale().coordinateToTime(e.offsetX);
        return t == null ? NaN : Number(t);
      })();
      if (price === null || !isFinite(price) || !Number.isFinite(timeNum)) return;
      brushActiveRef.current = true;
      const next: PreviewDrawing = {
        kind: "brush",
        points: [{ time: timeNum, price }],
        color: brushColorRef.current,
        width: 2,
      };
      setPreview(next);
      previewRef.current = next;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!brushActiveRef.current) return;
      brushActiveRef.current = false;
      const pv = previewRef.current;
      if (pv && pv.kind === "brush" && pv.points.length > 1) {
        addBrushStroke({
          symbol: symbolRef.current,
          points: pv.points,
          color: pv.color,
          width: pv.width,
        });
      }
      setPreview(null);
      previewRef.current = null;
      void e;
    };
    chartEl.addEventListener("pointerdown", onPointerDown);
    chartEl.addEventListener("pointerup", onPointerUp);

    chart.subscribeCrosshairMove((param) => {
      // Live-update: measure y previews según el tool activo.
      if (!param.time || !candleSeriesRef.current || !param.point) {
        // (following hover logic still below)
      } else {
        const p = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (p === null || !isFinite(p)) {
          // skip
        } else {
          const t = Number(param.time);
          // Live measure
          if (toolRef.current === "measure" && measureRef.current.phase === "placing") {
            setMeasure((prev) => (prev.phase === "placing" ? { ...prev, b: { time: t, price: p } } : prev));
          }
          // Live trend preview
          if (toolRef.current === "trend") {
            const pv = previewRef.current;
            if (pv && pv.kind === "trend") {
              const next: PreviewDrawing = { ...pv, b: { time: t, price: p } };
              setPreview(next);
              previewRef.current = next;
            }
          }
          // Live fib preview
          if (toolRef.current === "fib") {
            const pv = previewRef.current;
            if (pv && pv.kind === "fib") {
              const next: PreviewDrawing = { ...pv, b: { time: t, price: p } };
              setPreview(next);
              previewRef.current = next;
            }
          }
          // Live long pos preview
          if (toolRef.current === "long_pos") {
            const pv = previewRef.current;
            if (pv && pv.kind === "long") {
              const next: PreviewDrawing = { ...pv, cursor: { time: t, price: p } };
              setPreview(next);
              previewRef.current = next;
            }
          }
          // Brush: si el botón está apretado, añadir punto al trazo
          // activo. El preview se renderiza como path cada vez.
          if (toolRef.current === "brush" && brushActiveRef.current) {
            const pv = previewRef.current;
            if (pv && pv.kind === "brush") {
              const last = pv.points[pv.points.length - 1];
              if (!last || last.time !== t || last.price !== p) {
                const next: PreviewDrawing = { ...pv, points: [...pv.points, { time: t, price: p }] };
                setPreview(next);
                previewRef.current = next;
              }
            }
          }
        }
      }
      if (!param.time || !candleSeriesRef.current) {
        setHover(null);
        return;
      }
      const data = param.seriesData.get(candleSeriesRef.current);
      if (data && "open" in data) {
        const o = data.open as number;
        const c = data.close as number;
        setHover({
          o,
          h: data.high as number,
          l: data.low as number,
          c,
          time: Number(param.time),
          pct: o === 0 ? 0 : ((c - o) / o) * 100,
        });
      }
    });

    const tsRangeHandler = () => setMeasureCoords((p) => (p ? { ...p } : null));
    chart.timeScale().subscribeVisibleTimeRangeChange(tsRangeHandler);
    const logicalRangeHandler = () => {
      setMeasureCoords((p) => (p ? { ...p } : null));
      // Forzar al DrawingOverlay a re-computar coords de todos los drawings
      // persistidos (trend, fib, long): en scroll/zoom cambian las coord X/Y.
      setDrawingsRecalcTick((t) => t + 1);
      // Recalcular el volume profile (visible range) cuando el usuario hace
      // scroll o zoom — el cálculo depende de las velas visibles, no de todo
      // el histórico cargado.
      if (vprRecalcRef.current) vprRecalcRef.current();
      // Re-medir Y de los threshold labels: scroll/zoom cambia el rango
      // visible de precios y por ende el mapeo price -> Y del threshold.
      if (thresholdRecalcRef.current) thresholdRecalcRef.current();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);

    // ResizeObserver sobre el contenedor principal: detecta cambios de tamaño
    // de la ventana (del navegador o del layout).
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => recomputePaneOffsets());
    });
    ro.observe(containerRef.current);
    requestAnimationFrame(() => recomputePaneOffsets());

    // Pane-level ResizeObserver: cuando el usuario arrastra el separador entre
    // panes (built-in drag de lightweight-charts v5 con `panes.enableResize`),
    // la altura individual de cada pane cambia y dispara este observer, lo que
    // re-computa los `paneOffsets` para mantener las pills alienadas con cada
    // pane en tiempo real durante el drag.
    // NOTA: se recrea este observer dentro del effect de reconcile de instancias
    // cuando cambian la cantidad de panes, porque addObserver por pane debe
    // ocurrir después de que se hayan creado los panes nuevos.
    const paneResizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => recomputePaneOffsets());
    });
    paneResizeObserverRef.current = paneResizeObserver;

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(tsRangeHandler);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
      ro.disconnect();
      paneResizeObserver.disconnect();
      paneResizeObserverRef.current = null;
      chartEl.removeEventListener("pointerdown", onPointerDown);
      chartEl.removeEventListener("pointerup", onPointerUp);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      instanceSeriesRef.current.clear();
      priceLinesMapRef.current.clear();
      stretchFactorsRef.current = 0;
    };
  }, [addPriceLine, recomputePaneOffsets]);

  // ─── Effect: aplicar priceFormat dinámico (precision + minMove) al
  // candleSeries y al priceScale del precio, según el tickSize real de Binance
  // para el símbolo activo. TradingView Pro usa exactamente este dato: BTC=2
  // decimales, XRP=4, DOGE=5, SHIB=8. Sin esto, lightweight-charts usa el
  // default (precision=2, minMove=0.01) que hace que XRP se redondee a 1.11
  // en vez de mostrar 1.1135. También reseteamos priceFormat del priceScale
  // para que el eje derecho muestre la cantidad correcta de decimales. ──
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !chart) return;
    const precision = getSymbolPrecision(symbol);
    const minMove = getSymbolMinMove(symbol);
    try {
      candleSeries.applyOptions({
        priceFormat: { type: "price", precision, minMove },
      });
    } catch {}
  }, [symbol, symbolsReady]);

  // ─── Effect: reconcile instances → series + data ───────────────
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candleSeriesRef.current) return;
    const currentMap = instanceSeriesRef.current;
    const existing = new Set(currentMap.keys());
    const wanted = new Set(instances.map((i) => i.id));
    const visibleInstances = instances.filter((i) => !i.hidden);

    for (const id of existing) {
      const stillWanted = wanted.has(id) && instances.find((i) => i.id === id)?.hidden === false;
      if (!stillWanted) {
        const ent = currentMap.get(id);
        if (ent) {
          for (const ser of Object.values(ent.series)) {
            try {
              chart.removeSeries(ser);
            } catch {}
          }
          currentMap.delete(id);
        }
      }
    }

    const newLastValues: Record<string, IndicatorLastValue> = {};
    // Pre-asignar paneIndex a cada instancia visible:
    //  - pane === "overlay"  => 0 (sobre el precio)
    //  - pane === "separate" => pane 1, 2, 3... (dedicado)
    //  - pane === "separate" con overlayPaneIndex => mismo pane que el N-ésimo
    //    indicador separado (en orden de aparición). El usuario elige "1" para
    //    superponerse sobre el primer indicador separate, "2" sobre el segundo, etc.
    //  - pane === "volume"   => 0
    //
    // Resolvemos en DOS pasadas:
    //   pasada 1: asignar paneIndex a los separados SIN overlay (orden natural).
    //   pasada 2: resolver overlayPaneIndex -> paneIndex del N-ésimo separate.
    const paneAssignments = new Map<string, number>();
    const separateOrder: string[] = []; // ids de separados sin overlay, en orden de aparición
    for (const inst of visibleInstances) {
      const desc = getDescriptor(inst.type);
      if (desc.pane === "separate") {
        if (inst.overlayPaneIndex !== undefined && inst.overlayPaneIndex >= 1) {
          // se resuelve en la segunda pasada
          paneAssignments.set(inst.id, -1);
        } else {
          separateOrder.push(inst.id);
        }
      } else {
        paneAssignments.set(inst.id, 0);
      }
    }
    // Asignar paneIndex consecutivo a los separados sin overlay (1, 2, 3...)
    separateOrder.forEach((id, i) => paneAssignments.set(id, i + 1));
    // Ahora resolver overlays: N => paneIndex del N-ésimo separate (sin importar si también es overlay)
    // Si N no existe (ej: overlayPaneIndex=5 pero solo hay 2 separados), lo tratamos como
    // un pane dedicado nuevo al final.
    const totalNonOverlaySeparate = separateOrder.length;
    const overlayExtras: string[] = [];
    for (const inst of visibleInstances) {
      const desc = getDescriptor(inst.type);
      if (desc.pane !== "separate") continue;
      if (inst.overlayPaneIndex !== undefined && inst.overlayPaneIndex >= 1) {
        const N = inst.overlayPaneIndex;
        if (N >= 1 && N <= totalNonOverlaySeparate) {
          const targetId = separateOrder[N - 1];
          const targetPane = paneAssignments.get(targetId) ?? 0;
          paneAssignments.set(inst.id, targetPane);
        } else {
          // N fuera de rango => pane nuevo dedicado al final
          overlayExtras.push(inst.id);
        }
      }
    }
    let extraCounter = totalNonOverlaySeparate;
    for (const id of overlayExtras) {
      extraCounter++;
      paneAssignments.set(id, extraCounter);
    }
    const maxSeparatePane = Math.max(
      extraCounter,
      ...Array.from(paneAssignments.values()),
    );
    // Asegurar que existan todos los pane necesarios antes de asignar series
    if (maxSeparatePane > 0 && chart.panes().length <= maxSeparatePane) {
      while (chart.panes().length <= maxSeparatePane) {
        try {
          chart.addPane();
        } catch {}
      }
    }
    // Eje doble estilo TradingView Pro (derecha=ADX, izquierda=Squeeze):
    // Detectamos qué panes van a recibir un overlay con `ownsOverlayAxis`
    // (ej: ADX superpuesto sobre el pane del Squeeze). En esos panes:
    //   - El overlay dueño del eje (ADX) se dibuja en ese eje (auto-scale,
    //     no aplanado porque NO usamos fixedScale).
    //   - El dueño original del pane (Squeeze) migra al eje OPUESTO.
    // Ej: ADX con `ownsOverlayAxis: "right"` → eje derecho = ADX (auto-scale
    // al rango real del ADX), eje izquierdo = Squeeze (auto-scale, valles
    // naturales). Replica el eje doble de TV Pro sin aplanar el ADX.
    const panesWithOverlayAxis = new Set<number>();
    for (const inst of visibleInstances) {
      const d = getDescriptor(inst.type);
      const isOv = inst.overlayPaneIndex !== undefined && inst.overlayPaneIndex >= 1;
      if (!isOv) continue;
      if (d.ownsOverlayAxis === "right" || d.ownsOverlayAxis === "left") {
        const paneIdx = paneAssignments.get(inst.id);
        if (paneIdx !== undefined) panesWithOverlayAxis.add(paneIdx);
      }
    }
    // Mapear instancia dueña (no-overlay) → eje opuesto si su pane recibe un overlay axis
    const ownerToOppositeScale = new Map<string, "right" | "left">();
    for (const inst of visibleInstances) {
      const d = getDescriptor(inst.type);
      if (d.pane !== "separate") continue;
      const isOv = inst.overlayPaneIndex !== undefined && inst.overlayPaneIndex >= 1;
      if (isOv) continue; // skip overlays (somos los dueños).
      const paneIdx = paneAssignments.get(inst.id);
      if (paneIdx === undefined) continue;
      if (!panesWithOverlayAxis.has(paneIdx)) continue;
      // Buscar el overlay que tomó un eje en este pane y usar el opuesto.
      for (const other of visibleInstances) {
        const od = getDescriptor(other.type);
        const otherOv = other.overlayPaneIndex !== undefined && other.overlayPaneIndex >= 1;
        if (!otherOv) continue;
        if (paneAssignments.get(other.id) !== paneIdx) continue;
        if (od.ownsOverlayAxis === "right") {
          ownerToOppositeScale.set(inst.id, "left");
          break;
        }
        if (od.ownsOverlayAxis === "left") {
          ownerToOppositeScale.set(inst.id, "right");
          break;
        }
      }
    }
    // Mapear oldId→newly-assigned paneIndex para que traslados overlayPaneIndexudiantes se respeten.
    // OPTIMIZACIÓN: si todavía no hay velas cargadas (pasa al montar, antes de
    // fetchKlines), no creamos las series todavía — esperar a la segunda pasada
    // cuando candlesVersion > 0. Esto evita crear series vacías que luego
    // lightweight-charts a veces no renderiza correctamente tras setData([]).
    const hasCandles = candlesRef.current.length > 0;
    // Gestionar instances de tipo "vpr" (Volume Profile Visible Range) —
    // se dibujan como ISeriesPrimitive sobre el candleSeries (pane 0), no
    // como series estándar. Tuene su propio flujo de cálculo + recálculo
    // al hacer scroll/zoom:
    const vprMap = vprPrimitivesRef.current;
    const wantedVprIds = new Set<string>();
    // 1. Quitar primitives que ya no están wanted
    for (const [id, prim] of vprMap.entries()) {
      const stillWanted =
        wanted.has(id) && instances.find((i) => i.id === id)?.hidden === false;
      if (!stillWanted) {
        try {
          candleSeriesRef.current?.detachPrimitive(prim as never);
        } catch {}
        vprMap.delete(id);
      }
    }
    // 2. Función recalcular: obtiene las velas visibles y llama setCandles.
    const recalcVpr = () => {
      const chart2 = chartRef.current;
      const cs = candleSeriesRef.current;
      if (!chart2 || !cs) return;
      const timeScale = chart2.timeScale();
      const vr = timeScale.getVisibleRange();
      if (!vr || !("from" in vr) || !("to" in vr)) return;
      const fromTime = Math.floor((vr.from as number) / 1);
      const toTime = Math.ceil((vr.to as number) / 1);
      const visible = candlesRef.current.filter((c) => c.time >= fromTime && c.time <= toTime);
      if (visible.length === 0) return;
      // Precision del símbolo activo para el label del POC (formato de
      // precio consistente con el eje de precio y con QuotesPanel).
      const precision = getSymbolPrecision(symbol);
      for (const [id, prim] of vprMap.entries()) {
        const inst = instances.find((i) => i.id === id);
        if (!inst) continue;
        prim.setCandles(visible, {
          rows: (inst.params.rows as number) ?? 24,
          valueAreaPct: ((inst.params.valueAreaPct as number) ?? 70) / 100,
          side: (inst.params.side as "left" | "right") ?? "right",
          precision,
          volume: (inst.params.volume as "total" | "up" | "down") ?? "total",
          rowSize: (inst.params.rowSize as number) ?? 3,
          statusLine: inst.params.statusLine !== false,
        });
      }
    };
    vprRecalcRef.current = recalcVpr;
    for (const inst of visibleInstances) {
      const desc = getDescriptor(inst.type);
      // === Volume Profile: manejar con primitive, saltear flujo estándar ===
      if (desc.type === "vpr") {
        let prim = vprMap.get(inst.id);
        if (!prim) {
          prim = new VolumeProfilePrimitive();
          try {
            candleSeriesRef.current?.attachPrimitive(prim as never);
            vprMap.set(inst.id, prim);
          } catch {}
        }
        // Calcular al (re)montar / cambiar params
        recalcVpr();
        // Llenar el lastValues pill con el resultado actual del primitive
        const res = prim?.getResult();
        if (res) {
          newLastValues[inst.id] = {
            values: {
              poc: res.poc,
              vaHigh: res.vaHigh,
              vaLow: res.vaLow,
            },
            label: `${desc.name}`,
          };
        } else {
          newLastValues[inst.id] = {
            values: { poc: undefined, vaHigh: undefined, vaLow: undefined },
            label: `${desc.name}`,
          };
        }
        continue;
      }
      const paneIndex = paneAssignments.get(inst.id) ?? 0;
      let ent = currentMap.get(inst.id);
      const paramsStr = JSON.stringify(inst.params);
      const needRecreate =
        hasCandles &&
        (!ent ||
          ent.paneIndex !== paneIndex ||
          paramsStr !== ent.instanceParams ||
          JSON.stringify(inst.colors) !== ent.instanceColors ||
          JSON.stringify(inst.lineWidths) !== ent.instanceLineWidths ||
          JSON.stringify(inst.lineStyles) !== ent.instanceLineStyles ||
          JSON.stringify(inst.seriesHidden) !== ent.instanceSeriesHidden ||
          JSON.stringify(inst.thresholdLines ?? []) !== ent.instanceThresholdLines);
      if (needRecreate) {
        if (ent) {
          for (const ser of Object.values(ent.series)) {
            try {
              chart.removeSeries(ser);
            } catch {}
          }
        }
        const series: Record<string, SeriesApi> = {};
        // Eje doble estilo TradingView Pro: derecha=ADX, izquierda=Squeeze
        // (o viceversa según `ownsOverlayAxis` del overlay).
        //
        //   - Si este indicador es overlay con `ownsOverlayAxis: "right"` o
        //     `"left"`, usa ese eje visible (auto-scale, no aplanado porque
        //     no usamos fixedScale).
        //   - Si es el DUEÑO del pane (no overlay) Y hay un overlay-axis
        //     conviviendo en su pane, se mueve al eje opuesto (visible por-pane).
        //   - Overlay sin ownsOverlayAxis (CCI) sigue usando overlay oculto.
        const isOverlayInstance = inst.overlayPaneIndex !== undefined && inst.overlayPaneIndex >= 1;
        let priceScaleIdToUse: string | undefined = undefined;
        if (isOverlayInstance) {
          priceScaleIdToUse =
            desc.ownsOverlayAxis === "right" || desc.ownsOverlayAxis === "left"
              ? desc.ownsOverlayAxis
              : `overlay-${inst.id.slice(0, 8)}`;
        } else if (ownerToOppositeScale.has(inst.id)) {
          priceScaleIdToUse = ownerToOppositeScale.get(inst.id);
        }
        for (const spec of desc.series) {
          const color = inst.colors[spec.key] ?? spec.color;
          series[spec.key] = addSeriesForShape(chart, spec, color, paneIndex, {
            lineWidth: inst.lineWidths?.[spec.key],
            lineStyle: inst.lineStyles?.[spec.key],
            hidden: inst.seriesHidden?.[spec.key],
            priceScaleIdOverride: priceScaleIdToUse,
            isOscillator: desc.pane === "separate",
          });
        }
        // Dibujar threshold lines como price lines en la primera serie (que comparte la price scale del pane)
        const firstSeries = series[desc.series[0]?.key];
        if (firstSeries && inst.thresholdLines && inst.thresholdLines.length > 0) {
          for (const tl of inst.thresholdLines) {
            try {
              // El axisLabel pinta el recuadro con el valor "23.00" sobre
              // el eje activo del pane. El `title` de lightweight-charts v5
              // se renderiza a la izquierda del axisLabel dentro del pane y
              // lo trunca según el ancho disponible — para "threshold" queda
              // en "thres". Por eso NO usamos el title nativo y renderizamos
              // el label completo vía DOM (ver PriceChart.tsx, thresholdLabels).
              // Mantenemos sólo el axisLabel numérico + la línea horizontal.
              firstSeries.createPriceLine({
                price: tl.value,
                color: tl.color,
                lineWidth: tl.width as 1 | 2 | 3 | 4,
                lineStyle: resolveLineStyle(tl.style),
                axisLabelVisible: true,
                title: "",
              });
            } catch {}
          }
        }
        ent = {
          instanceId: inst.id,
          paneIndex,
          series,
          instanceParams: JSON.stringify(inst.params),
          instanceColors: JSON.stringify(inst.colors),
          instanceLineWidths: JSON.stringify(inst.lineWidths),
          instanceLineStyles: JSON.stringify(inst.lineStyles),
          instanceSeriesHidden: JSON.stringify(inst.seriesHidden),
          instanceThresholdLines: JSON.stringify(inst.thresholdLines ?? []),
          candleVersion: candlesVersion,
        };
        currentMap.set(inst.id, ent);
        // apply fixed scale if provided (osciladores acotados como RSI/MFI/Stoch/Williams)
        for (const s of desc.series) {
          if (!s.fixedScale) continue;
          const ser = series[s.key];
          if (!ser) continue;
          try {
            const ps = ser.priceScale();
            ps.applyOptions({ autoScale: false, scaleMargins: { top: 0.1, bottom: 0.1 } });
            ps.setVisibleRange({ from: s.fixedScale.min, to: s.fixedScale.max });
          } catch {}
        }
        // "Respiro" visual (estilo TradingView Pro): en los osciladores que
        // viven en pane separado (separate) aplica `scaleMargins` del 10%
        // arriba y abajo, dejando margen vacío en el pane para que los picos
        // y valles del indicador no queden pegados al borde. Como auto-scale
        // sigue activo, no se aplanan. Esto replica cómo TV Pro "respira"
        // visualmente el RSI/ADX/MFI en su pane, con espacio extra.
        if (desc.pane === "separate") {
          for (const s of desc.series) {
            const ser = series[s.key];
            if (!ser) continue;
            try {
              const ps = ser.priceScale();
              ps.applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
            } catch {}
          }
        }
        // Para el Volumen (priceScaleId: "volume"): aplicarle scaleMargins para que
        // el histograma quede al fondo del pane 0 (no pisando las velas de precio).
        // En TradingView, el volumen ocupa el ~20% inferior de la escala del precio.
        if (desc.pane === "volume") {
          for (const s of desc.series) {
            const ser = series[s.key];
            if (!ser) continue;
            try {
              const ps = ser.priceScale();
              ps.applyOptions({
                autoScale: true,
                scaleMargins: { top: 0.8, bottom: 0 },
              });
            } catch {}
          }
        }
      }
      // Si todavía no hay velas cargadas, skipear el push (series inexistentes
      // o vacías — se llenarán en la segunda pasada con candlesVersion > 0).
      if (!hasCandles) continue;
      const result = computeIndicator(inst.type, inst.params, candlesRef.current);
      const target = ent as InstanceSeries | undefined;
      if (target) {
        try {
          pushResultToSeries(target.series, result, desc, candlesRef.current);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`[useChart] pushResult FAILED for ${inst.type}:`, e);
        }
        newLastValues[inst.id] = buildLabel(inst, desc, result);
      }
    }
    // Apply stretch factors ONLY cuando la cantidad de panes cambió desde la
    // última pasada. Sin este guard, cada render (cambio de velas, agregar
    // instancia, etc.) resetea los stretch factors y DESHACE el resize manual
    // que el usuario hizo arrastrando el separador del pane.
    // Refs: stretchFactorsRef guarda la última cantidad de panes vistos.
    const currentPaneCount = chart.panes().length;
    const lastPaneCount = stretchFactorsRef.current;
    if (currentPaneCount > 1 && lastPaneCount !== currentPaneCount) {
      try {
        const separatePanes = currentPaneCount - 1;
        // El precio (pane 0) se lleva la mayor parte. Repartir el resto entre
        // los osciladores (igual que TradingView Pro).
        const priceStretch = Math.max(2, separatePanes * 2);
        chart.panes()[0]?.setStretchFactor(priceStretch);
        for (let i = 1; i < currentPaneCount; i++) {
          chart.panes()[i]?.setStretchFactor(1);
        }
        stretchFactorsRef.current = currentPaneCount;
        // Re-observar cada pane element para detectar cambios de altura por
        // drag del separador (re-electrónica del pane-resize observer).
        const obs = paneResizeObserverRef.current;
        if (obs) {
          obs.disconnect();
          for (let i = 0; i < currentPaneCount; i++) {
            const el = chart.panes()[i]?.getHTMLElement();
            if (el) obs.observe(el);
          }
        }
      } catch {}
    } else if (currentPaneCount <= 1 && lastPaneCount !== currentPaneCount) {
      try {
        chart.panes()[0]?.setStretchFactor(1);
        stretchFactorsRef.current = currentPaneCount;
        // En este caso no hay panelements que observar besides el contenedor
        // (el observer del contenedor ya se encarga del pane 0 único).
        const obs = paneResizeObserverRef.current;
        if (obs) {
          obs.disconnect();
          const el = chart.panes()[0]?.getHTMLElement();
          if (el) obs.observe(el);
        }
      } catch {}
    }
    // Remove trailing empty panes (lower-numbered panes can't be removed if they have series)
    try {
      const panes = chart.panes();
      for (let i = panes.length - 1; i > maxSeparatePane; i--) {
        const seriesOnPane = Array.from(currentMap.values()).filter((e) => e.paneIndex === i);
        if (seriesOnPane.length === 0) {
          chart.removePane(i);
        }
      }
      // Activar el eje OPUESTO al que tomó el overlay en panes donde conviven
      // un overlay-axis (ej: ADX) y el dueño migrado (ej: Squeeze). En esos
      // panes se ven DOS ejes:
      //   - el eje tomado por el overlay (visible por defecto)
      //   - el eje opuesto donde migró el dueño (activado aquí)
      // En todos los demás panes el eje opuesto queda oculto para no ensuciar.
      try {
        const panesNow = chart.panes();
        for (let i = 0; i < panesNow.length; i++) {
          const pane = panesNow[i];
          // Buscar qué eje tomó el overlay en este pane, y por ende cuál
          // opuesto debe activarse para el dueño migrado.
          let oppositeAxisToActivate: "right" | "left" | null = null;
          for (const inst of visibleInstances) {
            const id = paneAssignments.get(inst.id);
            if (id !== i) continue;
            if (ownerToOppositeScale.has(inst.id)) {
              oppositeAxisToActivate = ownerToOppositeScale.get(inst.id) ?? null;
              break;
            }
          }
          try {
            if (oppositeAxisToActivate === "left") {
              pane.priceScale("left").applyOptions({ visible: true });
              pane.priceScale("right").applyOptions({ visible: true });
            } else if (oppositeAxisToActivate === "right") {
              // dueño migrado a right: ya está visible globalmente;
              // overlay estará en left que también hay que activar
              pane.priceScale("right").applyOptions({ visible: true });
              pane.priceScale("left").applyOptions({ visible: true });
            } else {
              // pane sin overlay-axis: revertir axes a estado por defecto
              pane.priceScale("left").applyOptions({ visible: false });
              pane.priceScale("right").applyOptions({ visible: true });
            }
          } catch {}
        }
      } catch {}
    } catch {}
    setLastValues(newLastValues);
    // Construir lista de threshold labels para renderizar en el DOM (ver
    // PriceChart.tsx). Usamos `priceToCoordinate` de la primera serie de cada
    // instancia con thresholdLines.
    const tLabels: Array<{ instanceId: string; paneIndex: number; color: string; text: string; y: number }> = [];
    for (const inst of visibleInstances) {
      const ent2 = instanceSeriesRef.current.get(inst.id);
      if (!ent2 || !inst.thresholdLines || inst.thresholdLines.length === 0) continue;
      const firstKey = getDescriptor(inst.type).series[0]?.key;
      const ser = firstKey ? ent2.series[firstKey] : undefined;
      if (!ser) continue;
      for (const tl of inst.thresholdLines) {
        try {
          const y = ser.priceToCoordinate(tl.value);
          if (y === null || !Number.isFinite(y)) continue;
          // Sólo el label ("threshold"), sin duplicar el número 23.00 que ya
          // lo pinta el axisLabel nativo del eje derecho.
          const text = tl.label ?? String(tl.value);
          tLabels.push({
            instanceId: inst.id,
            paneIndex: ent2.paneIndex,
            color: tl.color,
            text,
            y,
          });
        } catch {}
      }
    }
    setThresholdLabels(tLabels);
    // Ref para que el callback del time scale (scroll/zoom) pueda recalcular
    // las Y de los threshold labels sin recrear el reconciler completo.
    thresholdRecalcRef.current = () => {
      const out: Array<{ instanceId: string; paneIndex: number; color: string; text: string; y: number }> = [];
      for (const inst of visibleInstances) {
        const ent3 = instanceSeriesRef.current.get(inst.id);
        if (!ent3 || !inst.thresholdLines || inst.thresholdLines.length === 0) continue;
        const firstKey = getDescriptor(inst.type).series[0]?.key;
        const ser = firstKey ? ent3.series[firstKey] : undefined;
        if (!ser) continue;
        for (const tl of inst.thresholdLines) {
          try {
            const y = ser.priceToCoordinate(tl.value);
            if (y === null || !Number.isFinite(y)) continue;
            // Sólo el label ("threshold"), sin duplicar el número 23.00 que ya
            // lo pinta el axisLabel nativo del eje derecho.
            const text = tl.label ?? String(tl.value);
            out.push({ instanceId: inst.id, paneIndex: ent3.paneIndex, color: tl.color, text, y });
          } catch {}
        }
      }
      setThresholdLabels(out);
    };
    requestAnimationFrame(() => recomputePaneOffsets());
    // Re-medir tras un tick más: lightweight-charts v5 puede tener el eje Y
    // todavía sin layout en el primer RAF (especialmente pane > 0 recién
    // creado, o cuando el ADX pasa de eje oculto a visible). El retry asegura
    // que `priceScale("right").width()` retorne el valor correcto para que
    // la pill del ADX no sea tapada por los labels del eje.
    setTimeout(() => recomputePaneOffsets(), 60);
  }, [instances, recomputePaneOffsets, candlesVersion]);

  // ─── Effect: cursor / reset measure on tool change ─────────────
  useEffect(() => {
    if (containerRef.current) {
      const drawingTool = ["hline", "trend", "fib", "measure", "long_pos", "text", "brush", "eraser", "zoom_in", "zoom_out"].includes(tool);
      containerRef.current.style.cursor = drawingTool ? "crosshair" : "";
    }
    if (tool !== "measure") {
      setMeasure(INITIAL_MEASURE);
    }
    // Al cambiar de tool, cancelar cualquier preview parcial del draw anterior
    // (ej: ususario selecciona trend, click 1 (entry), luego selecciona cursor —
    // descarta el preview). brush descarta el trazo activo al cambiar de tool.
    if (tool !== "trend" && tool !== "fib" && tool !== "long_pos" && tool !== "brush") {
      setPreview(null);
      previewRef.current = null;
      brushActiveRef.current = false;
    }
  }, [tool]);

  // ─── Effect: bump drawingsRecalcTick cuando los arrays persistidos
  // cambian (nuevo trend / fib / long / text / brush o borrado individual)
  // — el DrawingOverlay lo usa como `key` para re-computar coords. También
  // al cambiar de símbolo, cancelar el preview colgante del símbolo anterior.
  useEffect(() => {
    setDrawingsRecalcTick((t) => t + 1);
  }, [trendLines, fibRetracements, longPositions, textNotes, brushStrokes, symbol]);
  useEffect(() => {
    setPreview(null);
    previewRef.current = null;
    brushActiveRef.current = false;
  }, [symbol]);

  // ─── Effect: sync price lines ─────────────────────────────────
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const map = priceLinesMapRef.current;
    const linesForThisSymbol = priceLines.filter((p) => p.symbol === symbol);
    const activeIds = new Set(linesForThisSymbol.map((p) => p.id));
    for (const [id, apiLine] of map.entries()) {
      if (!activeIds.has(id)) {
        try {
          series.removePriceLine(apiLine);
        } catch {}
        map.delete(id);
      }
    }
    for (const pl of linesForThisSymbol) {
      if (!map.has(pl.id)) {
        const apiLine = series.createPriceLine({
          price: pl.price,
          color: TV_COLORS.blue,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "",
        });
        map.set(pl.id, apiLine);
      }
    }
  }, [priceLines, symbol]);

  // ─── Effect: compute measure coords (only when measure changes) ──
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!measure.a || !measure.b) {
      setMeasureCoords(null);
      return;
    }
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) {
      setMeasureCoords(null);
      return;
    }
    const ts = chart.timeScale();
    const aX = ts.timeToCoordinate(measure.a.time as UTCTimestamp);
    const bX = ts.timeToCoordinate(measure.b.time as UTCTimestamp);
    const aY = candleSeries.priceToCoordinate(measure.a.price);
    const bY = candleSeries.priceToCoordinate(measure.b.price);
    if (aX === null || bX === null || aY === null || bY === null) {
      setMeasureCoords(null);
      return;
    }
    const priceDiff = measure.b.price - measure.a.price;
    const pctChange = measure.a.price === 0 ? 0 : (priceDiff / measure.a.price) * 100;
    const start = Math.min(measure.a.time, measure.b.time);
    const end = Math.max(measure.a.time, measure.b.time);
    const inRange = candlesRef.current.filter((c) => c.time >= start && c.time <= end);
    const volume = inRange.reduce((s, c) => s + c.volume, 0);
    setMeasureCoords({
      aX,
      aY,
      bX,
      bY,
      priceDiff,
      pctChange,
      bars: inRange.length,
      volume,
      durationText: durationLabel(measure.a.time, measure.b.time),
      isUp: priceDiff >= 0,
      isPreview: measure.phase === "placing",
    });
  }, [measure]);

  void _timeframe;

  return {
    containerRef,
    chartRef,
    candleSeriesRef,
    candlesRef,
    hover,
    lastPrice,
    setLastPrice,
    paneOffsets,
    lastValues,
    thresholdLabels,
    measure,
    setMeasure,
    measureCoords,
    preview,
    drawingsRecalcTick,
    trendLines,
    fibRetracements,
    longPositions,
    textNotes,
    brushStrokes,
    removeTrendLine,
    removeFibRetracement,
    removeLongPosition,
    removeTextNote,
    removeBrushStroke,
    updateTextNote: (id: string, text: string) => updateTextNote(id, { text }),
    notifyCandlesChanged,
    candlesVersion,
  };
}

function durationLabel(aTime: number, bTime: number): string {
  const diff = Math.abs(bTime - aTime);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function resolveLineStyle(style: "solid" | "dashed" | "dotted"): LineStyle {
  switch (style) {
    case "dashed":
      return LineStyle.Dashed;
    case "dotted":
      return LineStyle.Dotted;
    case "solid":
    default:
      return LineStyle.Solid;
  }
}

function addSeriesForShape(
  chart: IChartApi,
  spec: SeriesSpec,
  color: string,
  paneIndex: number,
  options?: {
    lineWidth?: number;
    lineStyle?: "solid" | "dashed" | "dotted";
    hidden?: boolean;
    priceScaleIdOverride?: string;
    isOscillator?: boolean;
  },
): SeriesApi {
  const lineWidthRaw = options?.lineWidth ?? (spec.shape === "line-thick" ? 2 : 1);
  const lineWidth = Math.max(1, Math.min(4, Math.round(lineWidthRaw))) as 1 | 2 | 3 | 4;
  const lineStyle = resolveLineStyle(options?.lineStyle ?? "solid");
  const visible = options?.hidden !== true;
  // Si el caller nos da un override de priceScaleId (caso overlay), lo usamos.
  // Si no, respetamos el priceScaleId del spec (que puede ser fijo, ej: "aroonOsc").
  const priceScaleId = options?.priceScaleIdOverride ?? spec.priceScaleId;
  // Para osciladores (pane separado, no volumen), el priceFormat debe ser
  // "price" con 2 decimales. SIN esto, hereda el priceFormat por defecto del
  // chart, que es el del símbolo activo (XRP=4 decimales, SHIB=8). Eso hacía
  // que el label del crosshair en el pane del ADX mostrara "-1.5155" en vez de
  // "-1.52". En TradingView Pro, los osciladores siempre muestran 2 decimales
  // en el eje sin importar el símbolo activo.
  const isOscillator = options?.isOscillator ?? false;
  const oscillatorPriceFormat = isOscillator
    ? { type: "price" as const, precision: 2, minMove: 0.01 }
    : undefined;
  const common = {
    color,
    priceLineVisible: false,
    lastValueVisible: false,
    visible,
    priceScaleId,
    ...(oscillatorPriceFormat ? { priceFormat: oscillatorPriceFormat } : {}),
  };
  switch (spec.shape) {
    case "line":
      return chart.addSeries(LineSeries, { ...common, lineWidth, lineStyle }, paneIndex);
    case "line-thick":
      return chart.addSeries(LineSeries, { ...common, lineWidth, lineStyle }, paneIndex);
    case "step":
      return chart.addSeries(
        LineSeries,
        { ...common, lineWidth, lineStyle },
        paneIndex,
      );
    case "hist":
      return chart.addSeries(
        HistogramSeries,
        { color, priceLineVisible: false, lastValueVisible: false, visible, priceFormat: { type: "volume" }, priceScaleId },
        paneIndex,
      );
    case "hist-signed":
      return chart.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false, visible, priceScaleId },
        paneIndex,
      );
    case "dots":
      return chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth,
          lineStyle,
          pointMarkersVisible: true,
          priceLineVisible: false,
          lastValueVisible: false,
          visible,
          priceScaleId,
        },
        paneIndex,
      );
    case "band":
    default:
      return chart.addSeries(LineSeries, { ...common, lineWidth, lineStyle }, paneIndex);
  }
}

function pushResultToSeries(
  seriesMap: Record<string, SeriesApi>,
  result: IndicatorResult,
  desc: ReturnType<typeof getDescriptor>,
  candles: Candle[],
) {
  // Lookup velas por time para colorear el histograma de volumen (up/down).
  const candleByTime = new Map<number, Candle>();
  if (desc.type === "volume") {
    for (const c of candles) candleByTime.set(c.time, c);
  }
  const greenTransparent = `${TV_COLORS.green}80`;
  const redTransparent = `${TV_COLORS.red}80`;
  for (const spec of desc.series) {
    const ser = seriesMap[spec.key];
    if (!ser) continue;
    const data = result[spec.key] ?? [];
    if (spec.shape === "hist-signed") {
      const green = TV_COLORS.green;
      const red = TV_COLORS.red;
      const isSqueeze = desc.type === "squeeze";
      ser.setData(
        data.map((p) => {
          const cs = (p as IndicatorPoint & { colorState?: number }).colorState;
          let color: string;
          if (isSqueeze && cs !== undefined) {
            // LazyBear EXACTO (igual que TradingLatino Python):
            //   v>=0 inc => lime   (#00FF00)
            //   v>=0 dec => green  (#008000)
            //   v<0  dec => red    (#FF0000)
            //   v<0  inc => maroon (#800000)
            const colors = ["#00FF00", "#008000", "#FF0000", "#800000"];
            color = colors[cs] ?? `${green}80`;
          } else {
            color = p.value >= 0 ? `${green}80` : `${red}80`;
          }
          return {
            time: p.time as UTCTimestamp,
            value: p.value,
            color,
          };
        }),
      );
    } else if (spec.shape === "hist") {
      // Para el Volumen, colorear por vela: verde si close>=open, rojo si close<open
      // (estilo TradingView). Para cualquier otro histograma, usar el color del spec.
      if (desc.type === "volume" && spec.key === "value") {
        ser.setData(
          data.map((p) => {
            const c = candleByTime.get(p.time);
            const isUp = c ? c.close >= c.open : true;
            return {
              time: p.time as UTCTimestamp,
              value: p.value,
              color: isUp ? greenTransparent : redTransparent,
            };
          }),
        );
      } else {
        ser.setData(
          data.map((p) => ({
            time: p.time as UTCTimestamp,
            value: p.value,
          })),
        );
      }
    } else {
      ser.setData(
        data
          .filter((p) => isFinite(p.value))
          .map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
    }
  }
}

function buildLabel(
  inst: IndicatorInstance,
  desc: ReturnType<typeof getDescriptor>,
  result: IndicatorResult,
): IndicatorLastValue {
  const values: Record<string, number | undefined> = {};
  for (const spec of desc.series) {
    const arr = result[spec.key];
    if (!arr || arr.length === 0) {
      values[spec.key] = undefined;
      continue;
    }
    for (let i = arr.length - 1; i >= 0; i--) {
      if (isFinite(arr[i].value)) {
        values[spec.key] = arr[i].value;
        break;
      }
    }
  }
  const paramParts: string[] = [];
  for (const p of desc.params) {
    const v = inst.params[p.key];
    if (v === undefined) continue;
    const isInt = p.type === "int" || (p.type !== "select" && p.type !== "float" && Number.isInteger(p.default as number));
    paramParts.push(isInt ? String(v) : v.toString());
  }
  const label = `${desc.name}${paramParts.length > 0 ? ` (${paramParts.join(", ")})` : ""}`;
  return { values, label };
}
