/**
 * Catálogo(descriptor) central de todos los indicadores disponibles.
 * Define tipo, pane, parámetros configurables, rangos y colores por defecto.
 * Es la única fuente de verdad que usan store, UI y chart.
 */

export type PaneKind =
  | "overlay" // se dibuja sobre el gráfico de velas (pane 0)
  | "separate" // pane nuevo (osciladores: rsi, macd, stoch, etc.)
  | "volume"; // overlay al fondo del pane 0 con escala de volumen

export type ParamType = "int" | "float" | "select" | "bool";

export interface ParamSpec {
  key: string;
  label: string;
  type: ParamType;
  min?: number;
  max?: number;
  step?: number;
  default: number | string | boolean;
  /** Para type="select"; lista de opciones (valor → label a mostrar). */
  options?: { value: string; label: string }[];
}

export type SeriesShape =
  | "line"
  | "line-thick"
  | "hist"
  | "hist-signed"
  | "band" // dos lines + área entre ellas (BB / Keltner)
  | "dots"
  | "step";

export interface SeriesSpec {
  /** key interno dentro del resultado del indicador */
  key: string;
  /** label que se muestra en la pill */
  label: string;
  /** color por defecto */
  color: string;
  shape: SeriesShape;
  /** si el eje debe ignorarse al auto-fit (osciladores acotados) */
  fixedScale?: { min: number; max: number };
  /** grosor por defecto (1-4); si no, usa 1 */
  defaultWidth?: number;
  /** estilo por defecto: "solid" | "dashed" | "dotted"; si no, solid */
  defaultStyle?: "solid" | "dashed" | "dotted";
  /** si true, la serie viene oculta por defecto (e.g. DI+/DI− de ADX) */
  defaultHidden?: boolean;
  /** id de escala distinta al default del pane — útil cuando una serie necesita escala propia (e.g. Aroon osc con rango -100..100 mientras up/down están en 0..100) */
  priceScaleId?: string;
}

export interface ThresholdLine {
  value: number;
  color: string;
  style: "solid" | "dashed" | "dotted";
  width: 1 | 2 | 3 | 4;
  label?: string;
}

export interface IndicatorDescriptor {
  /** ID estable del tipo de indicador: "ema", "rsi", etc. */
  type: string;
  /** nombre a mostrar */
  name: string;
  /** categoría para agrupar en el menú Add Indicator */
  category:
    | "Medias móviles"
    | "Osciladores"
    | "Volumen"
    | "Volatilidad"
    | "Bandas"
    | "Tendencia"
    | "Otros";
  pane: PaneKind;
  /** breve descripción para el buscador */
  hint?: string;
  /** parámetros configurables */
  params: ParamSpec[];
  /** series que produce (1+) */
  series: SeriesSpec[];
  /** si true, todos los pares de series llenan/dibujan área desde 0 */
  filled?: boolean;
  /** líneas de umbral por defecto (líneas horizontales configurables, e.g. línea 23 del ADX) */
  defaultThresholdLines?: ThresholdLine[];
  /**
   * Indica qué eje debe "tomar prestado" este indicador cuando se superpone
   * (overlay) sobre el pane de otro indicador. Por defecto "none" (usa un
   * overlay oculto como antes). Si es "right" o "left", el overlay usará
   * el eje visible indicado, y el dueño original del pane se migrará al
   * eje opuesto. Auto-scale propia del overlay se mantiene (NO fixedScale),
   * así el indicador no se aplana.
   *
   * Ejemplo: ADX con `ownsOverlayAxis: "right"` superpuesto sobre Squeeze:
   *   - ADX → eje derecho (auto-scale, no aplanado)
   *   - Squeeze → eje izquierdo (auto-scale, valles naturales)
   * Replica el eje doble estilo TradingView Pro.
   */
  ownsOverlayAxis?: "right" | "left" | "none";
}

export const PALETTE = [
  "#2962ff", // blue
  "#ff9800", // orange
  "#26a69a", // green/teal
  "#e91e63", // pink
  "#ab47bc", // purple
  "#ffb74d", // amber
  "#42a5f5", // light blue
  "#ef5350", // red
  "#9ccc65", // lime
  "#7e57c2", // violet
  "#26c6da", // cyan
  "#ec407a", // magenta
  "#ffa726", // dark orange
  "#66bb6a", // green
];

export function defaultColor(type: string): string {
  // asigna color basado en hash del type para consistencia visual
  let h = 0;
  for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const INDICATOR_CATALOG: IndicatorDescriptor[] = [
  // ───────── Medias móviles ─────────
  {
    type: "sma",
    name: "SMA",
    category: "Medias móviles",
    pane: "overlay",
    hint: "Media móvil simple",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 500, default: 20 }],
    series: [{ key: "value", label: "SMA", color: "#ff9800", shape: "line" }],
  },
  {
    type: "ema",
    name: "EMA",
    category: "Medias móviles",
    pane: "overlay",
    hint: "Media móvil exponencial",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 500, default: 20 }],
    series: [{ key: "value", label: "EMA", color: "#2962ff", shape: "line" }],
  },
  {
    type: "wma",
    name: "WMA",
    category: "Medias móviles",
    pane: "overlay",
    hint: "Media móvil ponderada lineal",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 500, default: 14 }],
    series: [{ key: "value", label: "WMA", color: "#26c6da", shape: "line" }],
  },
  {
    type: "dema",
    name: "DEMA",
    category: "Medias móviles",
    pane: "overlay",
    hint: "Double Exponential MA",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 500, default: 21 }],
    series: [{ key: "value", label: "DEMA", color: "#7e57c2", shape: "line" }],
  },
  {
    type: "tema",
    name: "TEMA",
    category: "Medias móviles",
    pane: "overlay",
    hint: "Triple Exponential MA",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 500, default: 21 }],
    series: [{ key: "value", label: "TEMA", color: "#ec407a", shape: "line" }],
  },
  {
    type: "hma",
    name: "HMA",
    category: "Medias móviles",
    pane: "overlay",
    hint: "Hull Moving Average",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 500, default: 21 }],
    series: [{ key: "value", label: "HMA", color: "#9ccc65", shape: "line" }],
  },
  {
    type: "vwma",
    name: "VWMA",
    category: "Medias móviles",
    pane: "overlay",
    hint: "Volume Weighted MA",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 500, default: 20 }],
    series: [{ key: "value", label: "VWMA", color: "#ffa726", shape: "line" }],
  },
  {
    type: "vwap",
    name: "VWAP",
    category: "Medias móviles",
    pane: "overlay",
    hint: "Volume Weighted Average Price (intraday)",
    params: [
      { key: "period", label: "Período (anchored)", type: "int", min: 1, max: 500, default: 1 },
    ],
    series: [{ key: "value", label: "VWAP", color: "#e91e63", shape: "line" }],
  },
  // ───────── Bandas / Volatilidad ─────────
  {
    type: "bbands",
    name: "Bollinger Bands",
    category: "Bandas",
    pane: "overlay",
    hint: "Bandas de Bollinger (20, 2)",
    params: [
      { key: "period", label: "Período", type: "int", min: 2, max: 500, default: 20 },
      { key: "mult", label: "Desviaciones", type: "float", min: 0.1, max: 10, step: 0.1, default: 2 },
    ],
    series: [
      { key: "upper", label: "Upper", color: "#42a5f5", shape: "line" },
      { key: "middle", label: "Middle", color: "#ffb74d", shape: "line" },
      { key: "lower", label: "Lower", color: "#42a5f5", shape: "line" },
    ],
    filled: true,
  },
  {
    type: "kc",
    name: "Keltner Channels",
    category: "Bandas",
    pane: "overlay",
    hint: "Canales de Keltner (EMA + ATR)",
    params: [
      { key: "period", label: "Período EMA", type: "int", min: 2, max: 500, default: 20 },
      { key: "atrPeriod", label: "Período ATR", type: "int", min: 1, max: 200, default: 10 },
      { key: "mult", label: "Mult ATR", type: "float", min: 0.1, max: 10, step: 0.1, default: 1.5 },
    ],
    series: [
      { key: "upper", label: "Upper", color: "#ab47bc", shape: "line" },
      { key: "middle", label: "Middle", color: "#9ccc65", shape: "line" },
      { key: "lower", label: "Lower", color: "#ab47bc", shape: "line" },
    ],
    filled: true,
  },
  {
    type: "atr",
    name: "ATR",
    category: "Volatilidad",
    pane: "separate",
    hint: "Average True Range (volatilidad)",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 200, default: 14 }],
    series: [{ key: "value", label: "ATR", color: "#ffb74d", shape: "line" }],
  },
  // ───────── Osciladores ─────────
  {
    type: "rsi",
    name: "RSI",
    category: "Osciladores",
    pane: "separate",
    hint: "Relative Strength Index (Wilder)",
    params: [{ key: "period", label: "Período", type: "int", min: 2, max: 100, default: 14 }],
    series: [{ key: "value", label: "RSI", color: "#ab47bc", shape: "line", fixedScale: { min: 0, max: 100 } }],
  },
  {
    type: "stoch",
    name: "Stochastic",
    category: "Osciladores",
    pane: "separate",
    hint: "Stochastic %K / %D",
    params: [
      { key: "kPeriod", label: "%K", type: "int", min: 1, max: 200, default: 14 },
      { key: "dPeriod", label: "%D", type: "int", min: 1, max: 200, default: 3 },
      { key: "smooth", label: "Suavizado", type: "int", min: 1, max: 50, default: 3 },
    ],
    series: [
      { key: "k", label: "%K", color: "#2962ff", shape: "line", fixedScale: { min: 0, max: 100 } },
      { key: "d", label: "%D", color: "#ff9800", shape: "line", fixedScale: { min: 0, max: 100 } },
    ],
  },
  {
    type: "macd",
    name: "MACD",
    category: "Osciladores",
    pane: "separate",
    hint: "Moving Average Convergence Divergence",
    params: [
      { key: "fast", label: "Rápida", type: "int", min: 2, max: 200, default: 12 },
      { key: "slow", label: "Lenta", type: "int", min: 2, max: 400, default: 26 },
      { key: "signal", label: "Señal", type: "int", min: 1, max: 200, default: 9 },
    ],
    series: [
      { key: "macd", label: "MACD", color: "#2962ff", shape: "line" },
      { key: "signal", label: "Signal", color: "#ffb74d", shape: "line" },
      { key: "hist", label: "Hist", color: "#26a69a", shape: "hist-signed" },
    ],
  },
  {
    type: "adx",
    name: "ADX",
    category: "Osciladores",
    pane: "separate",
    hint: "Average Directional Index (DI+ / DI−) con línea de umbral configurable",
    params: [
      { key: "period", label: "Período", type: "int", min: 1, max: 200, default: 14 },
      { key: "threshold", label: "Umbral (línea cero)", type: "int", min: 1, max: 100, default: 23 },
    ],
    ownsOverlayAxis: "right",
    series: [
      { key: "adx", label: "ADX", color: "#ffffff", shape: "line-thick", defaultWidth: 2 },
      { key: "plusDI", label: "+DI", color: "#26a69a", shape: "line", defaultWidth: 1, defaultHidden: true },
      { key: "minusDI", label: "−DI", color: "#ef5350", shape: "line", defaultWidth: 1, defaultHidden: true },
    ],
    defaultThresholdLines: [{ value: 23, color: "#787b86", style: "dashed", width: 1, label: "threshold" }],
  },
  {
    type: "cci",
    name: "CCI",
    category: "Osciladores",
    pane: "separate",
    hint: "Commodity Channel Index",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 500, default: 20 }],
    series: [{ key: "value", label: "CCI", color: "#26c6da", shape: "line" }],
  },
  {
    type: "willr",
    name: "Williams %R",
    category: "Osciladores",
    pane: "separate",
    hint: "Williams Percent Range",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 200, default: 14 }],
    series: [{ key: "value", label: "%R", color: "#e91e63", shape: "line", fixedScale: { min: -100, max: 0 } }],
  },
  {
    type: "mfi",
    name: "MFI",
    category: "Osciladores",
    pane: "separate",
    hint: "Money Flow Index (RSI ponderado por volumen)",
    params: [{ key: "period", label: "Período", type: "int", min: 2, max: 200, default: 14 }],
    series: [{ key: "value", label: "MFI", color: "#9ccc65", shape: "line", fixedScale: { min: 0, max: 100 } }],
  },
  // ───────── Volumen ─────────
  {
    type: "volume",
    name: "Volumen",
    category: "Volumen",
    pane: "volume",
    hint: "Histograma de volumen",
    params: [{ key: "period", label: "MA Period", type: "int", min: 0, max: 500, default: 0 }],
    series: [
      { key: "value", label: "Vol", color: "#787b86", shape: "hist", priceScaleId: "volume" },
      { key: "ma", label: "Vol MA", color: "#ffb74d", shape: "line", priceScaleId: "volume" },
    ],
  },
  {
    type: "obv",
    name: "OBV",
    category: "Volumen",
    pane: "separate",
    hint: "On Balance Volume",
    params: [],
    series: [{ key: "value", label: "OBV", color: "#42a5f5", shape: "line" }],
  },
  // ───────── Tendencia ─────────
  {
    type: "psar",
    name: "Parabolic SAR",
    category: "Tendencia",
    pane: "overlay",
    hint: "Stop and Reverse",
    params: [
      { key: "step", label: "Paso (accel)", type: "float", min: 0.001, max: 1, step: 0.001, default: 0.02 },
      { key: "max", label: "Max accel", type: "float", min: 0.01, max: 1, step: 0.01, default: 0.2 },
    ],
    series: [{ key: "value", label: "PSAR", color: "#ec407a", shape: "dots" }],
  },
  {
    type: "supertrend",
    name: "SuperTrend",
    category: "Tendencia",
    pane: "overlay",
    hint: "Bandas ATR-based de tendencia",
    params: [
      { key: "atrPeriod", label: "Período ATR", type: "int", min: 1, max: 200, default: 10 },
      { key: "mult", label: "Mult ATR", type: "float", min: 0.1, max: 10, step: 0.1, default: 3 },
    ],
    series: [
      { key: "upper", label: "Up", color: "#ef5350", shape: "step" },
      { key: "lower", label: "Down", color: "#26a69a", shape: "step" },
    ],
  },
  {
    type: "ichimoku",
    name: "Ichimoku Cloud",
    category: "Tendencia",
    pane: "overlay",
    hint: "Ichimoku Kinko Hyo (9, 26, 52, 26)",
    params: [
      { key: "tenkan", label: "Tenkan", type: "int", min: 1, max: 200, default: 9 },
      { key: "kijun", label: "Kijun", type: "int", min: 1, max: 400, default: 26 },
      { key: "senkouB", label: "Senkou B", type: "int", min: 1, max: 400, default: 52 },
      { key: "displacement", label: "Desplazamiento", type: "int", min: 0, max: 200, default: 26 },
    ],
    series: [
      { key: "tenkan", label: "Tenkan", color: "#2962ff", shape: "line" },
      { key: "kijun", label: "Kijun", color: "#ef5350", shape: "line" },
      { key: "senkouA", label: "Senkou A", color: "#26a69a", shape: "line" },
      { key: "senkouB", label: "Senkou B", color: "#ef5350", shape: "line" },
      { key: "chikou", label: "Chikou", color: "#9ccc65", shape: "line" },
    ],
    filled: true,
  },
  // ───────── Más medias móviles avanzadas ─────────
  {
    type: "kama",
    name: "KAMA",
    category: "Medias móviles",
    pane: "overlay",
    hint: "Kaufman Adaptive Moving Average",
    params: [
      { key: "period", label: "Período", type: "int", min: 2, max: 500, default: 10 },
      { key: "fast", label: "Fast SC", type: "int", min: 2, max: 50, default: 2 },
      { key: "slow", label: "Slow SC", type: "int", min: 2, max: 100, default: 30 },
    ],
    series: [{ key: "value", label: "KAMA", color: "#9ccc65", shape: "line" }],
  },
  {
    type: "frama",
    name: "FRAMA",
    category: "Medias móviles",
    pane: "overlay",
    hint: "Fractal Adaptive Moving Average",
    params: [{ key: "period", label: "Período", type: "int", min: 2, max: 200, default: 16 }],
    series: [{ key: "value", label: "FRAMA", color: "#26c6da", shape: "line" }],
  },
  {
    type: "hullMA",
    name: "Hull MA",
    category: "Medias móviles",
    pane: "overlay",
    hint: "Hull Moving Average (variante short/long)",
    params: [{ key: "period", label: "Período", type: "int", min: 2, max: 500, default: 16 }],
    series: [{ key: "value", label: "Hull MA", color: "#ec407a", shape: "line" }],
  },
  // ───────── Más Bandas / Volatilidad ─────────
  {
    type: "donchian",
    name: "Donchian Channels",
    category: "Bandas",
    pane: "overlay",
    hint: "Canales de Donchian (N-period high/low)",
    params: [{ key: "period", label: "Período", type: "int", min: 2, max: 500, default: 20 }],
    series: [
      { key: "upper", label: "Upper", color: "#42a5f5", shape: "line" },
      { key: "middle", label: "Middle", color: "#787b86", shape: "line", defaultStyle: "dotted", defaultHidden: true },
      { key: "lower", label: "Lower", color: "#42a5f5", shape: "line" },
    ],
  },
  {
    type: "env",
    name: "Envelopes",
    category: "Bandas",
    pane: "overlay",
    hint: "Moving Average Envelopes (SMA ± %)",
    params: [
      { key: "period", label: "Período", type: "int", min: 2, max: 500, default: 20 },
      { key: "pct", label: "Desviación (%)", type: "float", min: 0.1, max: 50, step: 0.1, default: 5 },
    ],
    series: [
      { key: "upper", label: "Upper", color: "#ab47bc", shape: "line" },
      { key: "middle", label: "Middle", color: "#ffb74d", shape: "line", defaultStyle: "dotted", defaultHidden: true },
      { key: "lower", label: "Lower", color: "#ab47bc", shape: "line" },
    ],
  },
  {
    type: "bbwidth",
    name: "BB Width",
    category: "Volatilidad",
    pane: "separate",
    hint: "Bollinger Bands Width (volatilidad comprimida/expandida)",
    params: [
      { key: "period", label: "Período", type: "int", min: 2, max: 500, default: 20 },
      { key: "mult", label: "Desviaciones", type: "float", min: 0.1, max: 10, step: 0.1, default: 2 },
    ],
    series: [{ key: "value", label: "BB Width", color: "#26c6da", shape: "line" }],
  },
  {
    type: "stddev",
    name: "Standard Deviation",
    category: "Volatilidad",
    pane: "separate",
    hint: "Desviación estándar de los cierres",
    params: [{ key: "period", label: "Período", type: "int", min: 2, max: 500, default: 20 }],
    series: [{ key: "value", label: "StdDev", color: "#ffb74d", shape: "line" }],
  },
  {
    type: "chop",
    name: "Choppiness Index",
    category: "Volatilidad",
    pane: "separate",
    hint: "¿Mercado en rango o tendencial? (>61.8 rango, <38.2 tendencia)",
    params: [{ key: "period", label: "Período", type: "int", min: 2, max: 200, default: 14 }],
    series: [
      { key: "value", label: "Chop", color: "#9ccc65", shape: "line", fixedScale: { min: 0, max: 100 } },
    ],
  },
  // ───────── Osciladores extra ─────────
  {
    type: "ao",
    name: "Awesome Oscillator",
    category: "Osciladores",
    pane: "separate",
    hint: "AO = SMA5(median) − SMA34(median)",
    params: [
      { key: "fast", label: "Fast", type: "int", min: 1, max: 50, default: 5 },
      { key: "slow", label: "Slow", type: "int", min: 2, max: 200, default: 34 },
    ],
    series: [{ key: "value", label: "AO", color: "#26a69a", shape: "hist-signed" }],
  },
  {
    type: "roc",
    name: "ROC",
    category: "Osciladores",
    pane: "separate",
    hint: "Rate of Change",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 500, default: 12 }],
    series: [{ key: "value", label: "ROC", color: "#ff9800", shape: "line" }],
  },
  {
    type: "trix",
    name: "TRIX",
    category: "Osciladores",
    pane: "separate",
    hint: "Triple EMA ROC",
    params: [{ key: "period", label: "Período", type: "int", min: 2, max: 500, default: 12 }],
    series: [{ key: "value", label: "TRIX", color: "#26c6da", shape: "line" }],
  },
  {
    type: "cmo",
    name: "CMO",
    category: "Osciladores",
    pane: "separate",
    hint: "Chande Momentum Oscillator",
    params: [{ key: "period", label: "Período", type: "int", min: 2, max: 200, default: 14 }],
    series: [
      { key: "value", label: "CMO", color: "#e91e63", shape: "line", fixedScale: { min: -100, max: 100 } },
    ],
  },
  {
    type: "coppock",
    name: "Coppock Curve",
    category: "Osciladores",
    pane: "separate",
    hint: "WMA(RoC14 + RoC11) sobre 10 períodos",
    params: [
      { key: "roc1", label: "RoC 1", type: "int", min: 1, max: 100, default: 14 },
      { key: "roc2", label: "RoC 2", type: "int", min: 1, max: 100, default: 11 },
      { key: "wma", label: "WMA", type: "int", min: 1, max: 100, default: 10 },
    ],
    series: [{ key: "value", label: "Coppock", color: "#42a5f5", shape: "line" }],
  },
  {
    type: "squeeze",
    name: "Squeeze Momentum",
    category: "Osciladores",
    pane: "separate",
    hint: "LazyBear Squeeze Momentum — lime=positivo creciente, green=positivo decreciente, red=negativo decreciente, maroon=negativo creciente. Bandas BB (azul) y KC (punteadas) ocultas por defecto.",
    params: [
      { key: "bbPeriod", label: "BB Período", type: "int", min: 2, max: 200, default: 20 },
      { key: "bbMult", label: "BB Mult", type: "float", min: 0.1, max: 10, step: 0.1, default: 2 },
      { key: "kcPeriod", label: "KC Período", type: "int", min: 1, max: 200, default: 20 },
      { key: "kcMult", label: "KC Mult", type: "float", min: 0.1, max: 10, step: 0.1, default: 1.5 },
    ],
    series: [
      { key: "value", label: "Momentum", color: "#2962ff", shape: "hist-signed" },
      { key: "kcUp", label: "KC Up", color: "#26a69a", shape: "line", defaultWidth: 1, defaultStyle: "dotted", defaultHidden: true },
      { key: "kcDown", label: "KC Down", color: "#ef5350", shape: "line", defaultWidth: 1, defaultStyle: "dotted", defaultHidden: true },
      { key: "kcMid", label: "KC Mid", color: "#787b86", shape: "line", defaultWidth: 1, defaultStyle: "dotted", defaultHidden: true },
      { key: "bbUp", label: "BB Up", color: "#26c6da", shape: "line", defaultWidth: 1, defaultStyle: "dashed", defaultHidden: true },
      { key: "bbDown", label: "BB Down", color: "#26c6da", shape: "line", defaultWidth: 1, defaultStyle: "dashed", defaultHidden: true },
    ],
  },
  // ───────── Tendencia extra ─────────
  {
    type: "aroon",
    name: "Aroon",
    category: "Tendencia",
    pane: "separate",
    hint: "Aroon Up / Down + Aroon Oscillator",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 200, default: 14 }],
    series: [
      { key: "up", label: "Up", color: "#26a69a", shape: "line", fixedScale: { min: 0, max: 100 } },
      { key: "down", label: "Down", color: "#ef5350", shape: "line", fixedScale: { min: 0, max: 100 } },
      { key: "osc", label: "Osc", color: "#ffb74d", shape: "line", fixedScale: { min: -100, max: 100 }, priceScaleId: "aroonOsc", defaultWidth: 2, defaultStyle: "dotted", defaultHidden: true },
    ],
  },
  {
    type: "zigzag",
    name: "ZigZag",
    category: "Tendencia",
    pane: "overlay",
    hint: "ZigZag (filtrado por % de cambio mínimo)",
    params: [{ key: "dev", label: "Desviación (%)", type: "float", min: 0.1, max: 50, step: 0.1, default: 5 }],
    series: [{ key: "value", label: "ZigZag", color: "#ffa726", shape: "line", defaultWidth: 2 }],
  },
  // ───────── Volumen extra ─────────
  {
    type: "ad",
    name: "Accumulation/Distribution",
    category: "Volumen",
    pane: "separate",
    hint: "Línea A/D basada en money flow multiplier",
    params: [],
    series: [{ key: "value", label: "A/D", color: "#42a5f5", shape: "line" }],
  },
  {
    type: "cmf",
    name: "CMF",
    category: "Volumen",
    pane: "separate",
    hint: "Chaikin Money Flow",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 200, default: 20 }],
    series: [{ key: "value", label: "CMF", color: "#9ccc65", shape: "hist-signed" }],
  },
  {
    type: "volRatio",
    name: "Volumes Ratio",
    category: "Volumen",
    pane: "separate",
    hint: "Ratio entre volumen actual y media móvil de volumen (SP/MP)",
    params: [{ key: "period", label: "Período (media)", type: "int", min: 1, max: 500, default: 20 }],
    series: [{ key: "value", label: "Vol Ratio", color: "#ec407a", shape: "line" }],
  },
  {
    type: "vix",
    name: "Volatility Index (VIX-like)",
    category: "Volatilidad",
    pane: "separate",
    hint: "Volatilidad implicita estimada vía ATR%/close (proxy del VIX)",
    params: [{ key: "period", label: "Período", type: "int", min: 1, max: 200, default: 14 }],
    series: [{ key: "value", label: "VIX", color: "#ef5350", shape: "line" }],
  },
  {
    type: "vwapIntraday",
    name: "VWAP Intraday (session)",
    category: "Medias móviles",
    pane: "overlay",
    hint: "VWAP reseteable por día",
    params: [],
    series: [
      { key: "value", label: "VWAP", color: "#e91e63", shape: "line", defaultWidth: 2 },
      { key: "upper", label: "Upper", color: "#e91e6388", shape: "line", defaultWidth: 1, defaultStyle: "dotted", defaultHidden: true },
      { key: "lower", label: "Lower", color: "#e91e6388", shape: "line", defaultWidth: 1, defaultStyle: "dotted", defaultHidden: true },
    ],
  },
  {
    type: "cog",
    name: "Center of Gravity",
    category: "Osciladores",
    pane: "separate",
    hint: "Center of Gravity oscillator",
    params: [{ key: "period", label: "Período", type: "int", min: 2, max: 200, default: 10 }],
    series: [{ key: "value", label: "COG", color: "#7e57c2", shape: "line" }],
  },
  {
    type: "dpo",
    name: "Detrended Price Osc",
    category: "Osciladores",
    pane: "separate",
    hint: "Detrended Price Oscillator (ciclos)",
    params: [{ key: "period", label: "Período", type: "int", min: 2, max: 500, default: 20 }],
    series: [{ key: "value", label: "DPO", color: "#ec407a", shape: "line" }],
  },
  {
    type: "fibMA",
    name: "Fibonacci EMA (5/8/13/21/55)",
    category: "Medias móviles",
    pane: "overlay",
    hint: "Set de EMAs basadas en la secuencia Fibonacci",
    params: [],
    series: [
      { key: "e5", label: "EMA 5", color: "#ec407a", shape: "line", defaultWidth: 1 },
      { key: "e8", label: "EMA 8", color: "#ff9800", shape: "line", defaultWidth: 1 },
      { key: "e13", label: "EMA 13", color: "#42a5f5", shape: "line", defaultWidth: 1 },
      { key: "e21", label: "EMA 21", color: "#26a69a", shape: "line", defaultWidth: 1 },
      { key: "e55", label: "EMA 55", color: "#ab47bc", shape: "line", defaultWidth: 2 },
    ],
  },
  // ───────── Volume Profile ─────────
  {
    type: "vpr",
    name: "Volume Profile (Visible Range)",
    category: "Volumen",
    pane: "overlay",
    hint: "Volume Profile Visible Range — cálcula el POC (Point of Control, nivel de mayor volumen) y el Value Area (70%) de las velas visibles en pantalla. Se recalcula al hacer zoom/scroll.",
    params: [
      { key: "rows", label: "Rows", type: "int", min: 8, max: 200, default: 24 },
      { key: "valueAreaPct", label: "Value Area %", type: "float", min: 50, max: 95, step: 1, default: 70 },
      {
        key: "side",
        label: "Layout",
        type: "select",
        default: "right",
        options: [
          { value: "right", label: "Right" },
          { value: "left", label: "Left" },
        ],
      },
      {
        key: "volume",
        label: "Volume",
        type: "select",
        default: "total",
        options: [
          { value: "total", label: "Total Volume" },
          { value: "up", label: "Up Volume" },
          { value: "down", label: "Down Volume" },
        ],
      },
      { key: "rowSize", label: "Row Size", type: "int", min: 1, max: 5, default: 3 },
      { key: "statusLine", label: "Status Line", type: "bool", default: true },
    ],
    series: [
      { key: "poc", label: "POC", color: "#ff9800", shape: "line", defaultWidth: 2, defaultStyle: "solid" },
      { key: "vaHigh", label: "VA High", color: "#26a69a", shape: "line", defaultWidth: 1, defaultStyle: "dashed" },
      { key: "vaLow", label: "VA Low", color: "#ef5350", shape: "line", defaultWidth: 1, defaultStyle: "dashed" },
    ],
  },
];


/** mapa por type para lookup O(1) */
export const DESCRIPTORS: Record<string, IndicatorDescriptor> = Object.fromEntries(
  INDICATOR_CATALOG.map((d) => [d.type, d]),
);

export function getDescriptor(type: string): IndicatorDescriptor {
  const d = DESCRIPTORS[type];
  if (!d) throw new Error(`Unknown indicator type: ${type}`);
  return d;
}
