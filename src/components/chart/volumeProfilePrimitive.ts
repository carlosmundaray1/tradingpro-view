"use client";

import {
  type IChartApi,
  type ISeriesApi,
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type IPrimitivePaneRenderer,
  type SeriesAttachedParameter,
  type IPriceScaleApi,
  type Time,
  type Coordinate,
  type PriceToCoordinateConverter,
  LineStyle,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { Candle } from "@/lib/binance/types";

/**
 * Volume Profile Visible Range (VPVR) — custom series primitive
 * que replica el "Volume Profile Visible Range" de TradingView Pro.
 *
 * Dibuja en el pane principal (pane 0) un histograma HORIZONTAL cuyas
 * filas representan niveles de precio del rango visible. Cada barra
 * tiene ancho proporcional al volumen acumulado en esa fila. El POC
 * (Point of Control, fila de máximo volumen) se dibuja en color
 * destacado, y las barras dentro del Value Area (70% del volumen total)
 * con un tono más claro. La línea POC también se marca en el eje
 * derecho con un axis label.
 *
 * El cálculo se hace en `setCandles(visibleCandles, params)`. El
 * consumidor es responsable de pasar SÓLO las velas visibles
 * (chart.timeScale().getVisibleRange() → filter) y Recalcular al
 * hacer scroll/zoom suscribiéndose a subscribeVisibleLogicalRangeChange.
 */

export interface VprOptions {
  rows: number;
  valueAreaPct: number; // 0.5..0.95
  side?: "left" | "right"; // de qué lado del chart se dibuja el histograma
  precision?: number; // decimales del precio (de getSymbolPrecision)
  volume?: "total" | "up" | "down"; // cómo colorear las barras
  rowSize?: number; // grosor de las barras (1=delgado, 5=grueso)
  statusLine?: boolean; // mostrar/ocultar label "POC <precio>"
}

interface VprResult {
  poc: number;
  vaHigh: number;
  vaLow: number;
  rows: RowData[];
  totalVol: number;
  maxVol: number;
  side: "left" | "right";
  volume: "total" | "up" | "down";
  rowSize: number;
  statusLine: boolean;
}

interface RowData {
  lo: number;
  hi: number;
  mid: number;
  volume: number;
  upVol: number;
  downVol: number;
  inValueArea: boolean;
  isPoc: boolean;
}

// ──────────────────────────────────────────────────────────────
// Cálculo del Volume Profile (igual que vpr() en lib/indicators)
// Replicado aquí para tener un primitive autocontenido.
// ──────────────────────────────────────────────────────────────
function computeVpr(candles: Candle[], opts: VprOptions): VprResult | null {
  const rows = Math.max(4, opts.rows);
  const vaPct = Math.min(0.99, Math.max(0.5, opts.valueAreaPct));
  const side = opts.side === "left" ? "left" : "right";
  const volume = opts.volume === "up" || opts.volume === "down" ? opts.volume : "total";
  const rowSize = typeof opts.rowSize === "number" && opts.rowSize >= 1 && opts.rowSize <= 5 ? opts.rowSize : 3;
  const statusLine = opts.statusLine !== false; // default true
  if (candles.length === 0) return null;
  let gMin = candles[0].low;
  let gMax = candles[0].high;
  let totalVol = 0;
  for (const c of candles) {
    if (c.low < gMin) gMin = c.low;
    if (c.high > gMax) gMax = c.high;
    totalVol += c.volume;
  }
  if (gMax <= gMin || totalVol <= 0) return null;
  const rowWidth = (gMax - gMin) / rows;
  const volByRow = new Array<number>(rows).fill(0);
  const upVolByRow = new Array<number>(rows).fill(0);
  const downVolByRow = new Array<number>(rows).fill(0);
  for (const c of candles) {
    let iLo = Math.floor((c.low - gMin) / rowWidth);
    let iHi = Math.floor((c.high - gMin) / rowWidth);
    if (iLo < 0) iLo = 0;
    if (iHi > rows - 1) iHi = rows - 1;
    if (iHi < iLo) iHi = iLo;
    // Volumen bullish (close >= open) o bearish (close < open) de esta vela.
    const bullish = c.close >= c.open;
    if (iHi === iLo) {
      volByRow[iLo] += c.volume;
      if (bullish) upVolByRow[iLo] += c.volume;
      else downVolByRow[iLo] += c.volume;
      continue;
    }
    const span = c.high - c.low;
    if (span <= 0) {
      volByRow[iLo] += c.volume;
      if (bullish) upVolByRow[iLo] += c.volume;
      else downVolByRow[iLo] += c.volume;
      continue;
    }
    for (let i = iLo; i <= iHi; i++) {
      const fMin = gMin + i * rowWidth;
      const fMax = fMin + rowWidth;
      const overlap = Math.max(0, Math.min(c.high, fMax) - Math.max(c.low, fMin));
      const part = (overlap / span) * c.volume;
      volByRow[i] += part;
      if (bullish) upVolByRow[i] += part;
      else downVolByRow[i] += part;
    }
  }
  let pocIndex = 0;
  let pocVol = -Infinity;
  for (let i = 0; i < rows; i++) {
    if (volByRow[i] > pocVol) {
      pocVol = volByRow[i];
      pocIndex = i;
    }
  }
  const pocPrice = gMin + (pocIndex + 0.5) * rowWidth;
  const targetVol = totalVol * vaPct;
  let vaIdxLo = pocIndex;
  let vaIdxHi = pocIndex;
  let vaVol = volByRow[pocIndex];
  while (vaVol < targetVol && (vaIdxLo > 0 || vaIdxHi < rows - 1)) {
    const above = vaIdxHi < rows - 1 ? volByRow[vaIdxHi + 1] : -Infinity;
    const below = vaIdxLo > 0 ? volByRow[vaIdxLo - 1] : -Infinity;
    if (above >= below && vaIdxHi < rows - 1) {
      vaIdxHi++;
      vaVol += volByRow[vaIdxHi];
    } else if (vaIdxLo > 0) {
      vaIdxLo--;
      vaVol += volByRow[vaIdxLo];
    } else {
      break;
    }
  }
  let maxVol = 0;
  for (const v of volByRow) if (v > maxVol) maxVol = v;
  const rowArr: RowData[] = [];
  for (let i = 0; i < rows; i++) {
    const lo = gMin + i * rowWidth;
    const hi = lo + rowWidth;
    rowArr.push({
      lo,
      hi,
      mid: lo + rowWidth / 2,
      volume: volByRow[i],
      upVol: upVolByRow[i],
      downVol: downVolByRow[i],
      inValueArea: i >= vaIdxLo && i <= vaIdxHi,
      isPoc: i === pocIndex,
    });
  }
  return {
    poc: pocPrice,
    vaHigh: gMin + (vaIdxHi + 1) * rowWidth,
    vaLow: gMin + vaIdxLo * rowWidth,
    rows: rowArr,
    totalVol,
    maxVol,
    side,
    volume,
    rowSize,
    statusLine,
  };
}

// ──────────────────────────────────────────────────────────────
// PaneView + Renderer  (replica el dibujado hangado de TV Pro)
// ──────────────────────────────────────────────────────────────
const TV_PALETTE = {
  // Colores fieles a TradingView Pro (tema dark "Tropical")
  // Opacidad alta (~85-90%) como TV Pro: las velas se siguen viendo pero las barras del VPR son claramente visibles
  poc: "#ff9800",         // naranja/ámbar para POC (línea y label)
  pocDim: "#ff9800",       // barra POC sólida
  va: "#2962ff",           // azul sólido para Value Area (se aplica con globalAlpha en renderer)
  vaStrong: "#2962ff",     // azul vivo para borde VA
  outside: "#787b86",      // gris sólido para barras fuera de VA
  // Modos up/down volume (cuando volume!="total")
  upVa: "#26a69a",         // verde sólido (VA up)
  upOutside: "#26a69a",    // verde (out of VA up) - se atenúa con globalAlpha
  downVa: "#ef5350",       // rojo sólido (VA down)
  downOutside: "#ef5350",  // rojo (out of VA down) - se atenúa con globalAlpha
  text: "#d1d4dc",        // etiquetas
  textMuted: "#787b86",
  bgPanel: "#1e222d",
};

class VolumeProfileRenderer implements IPrimitivePaneRenderer {
  private rows: RowData[];
  private endX: number;
  private startX: number;
  private paneWidth: number;
  private paneHeight: number;
  private maxVol: number;
  private pocPrice: number;
  private vaHigh: number;
  private vaLow: number;
  private visible: boolean;
  private priceToCoord: PriceToCoordinateConverter;
  private barWidthMax: number;
  private side: "left" | "right";
  private precision: number | null;
  private volume: "total" | "up" | "down";
  private rowSize: number;
  private statusLine: boolean;

  constructor(params: {
    rows: RowData[];
    startX: number;
    endX: number;
    paneWidth: number;
    paneHeight: number;
    maxVol: number;
    pocPrice: number;
    vaHigh: number;
    vaLow: number;
    visible: boolean;
    priceToCoord: PriceToCoordinateConverter;
    barWidthMax: number;
    side: "left" | "right";
    precision?: number | null;
    volume?: "total" | "up" | "down";
    rowSize?: number;
    statusLine?: boolean;
  }) {
    this.rows = params.rows;
    this.startX = params.startX;
    this.endX = params.endX;
    this.paneWidth = params.paneWidth;
    this.paneHeight = params.paneHeight;
    this.maxVol = params.maxVol;
    this.pocPrice = params.pocPrice;
    this.vaHigh = params.vaHigh;
    this.vaLow = params.vaLow;
    this.visible = params.visible;
    this.priceToCoord = params.priceToCoord;
    this.barWidthMax = params.barWidthMax;
    this.side = params.side;
    this.precision = params.precision ?? null;
    this.volume = params.volume === "up" || params.volume === "down" ? params.volume : "total";
    this.rowSize = typeof params.rowSize === "number" && params.rowSize >= 1 && params.rowSize <= 5 ? params.rowSize : 3;
    this.statusLine = params.statusLine !== false;
  }

  /** Devuelve [x1, x2] de la barra de ancho w teniendo en cuenta el lado.
   *  - side="left"  → la barra crece de izquierda (startX) hacia la derecha.
   *  - side="right" → la barra crece de derecha (endX) hacia la izquierda
   *    (el borde exterior de cada barra queda alineado en endX).
   */
  private barCoords(w: number): [number, number] {
    if (this.side === "right") {
      return [this.endX - w, this.endX];
    }
    return [this.startX, this.startX + w];
  }

  /** Devuelve [xAnchor, anchorSide] para posicionar el label del POC.
   *  - side="right" → el label va en el extremo derecho (fuera del chart, "pegado" al eje derecho).
   *  - side="left"  → el label va en el extremo izquierdo (pegado al eje izquierdo).
   */
  private labelAnchor(): number {
    return this.side === "right" ? this.endX : this.startX;
  }

  draw(target: CanvasRenderingTarget2D) {
    if (!this.visible || this.rows.length === 0) return;
    // Usamos `useMediaCoordinateSpace` (NO `useBitmapCoordinateSpace`) para
    // que el contexto del canvas esté escalado por `horizontalPixelRatio` y
    // `verticalPixelRatio` automáticamente. De este modo podemos trabajar
    // directamente en coordenadas CSS (las que retorna `priceToCoordinate`
    // y las que pasamos como `startX`/`endX`), y el browser/lightweight-charts
    // se encarga de mapearlas al bitmap con el DPR correcto.
    //
    // Si en cambio usábamos `useBitmapCoordinateSpace`, las coordenadas CSS
    // se interpretaban como pixels de bitmap (1 CSS px = 1/DPR bitmap px),
    // causando que el profile se "corriera" visualmente en sistemas con
    // escalado de pantalla (Windows scaling 125%/150%, retina, etc.):
    // el profile terminaba anclado a una posición intermedia del chart en
    // vez de pegado al eje de precio derecho.
    target.useMediaCoordinateSpace((scope: { context: CanvasRenderingContext2D }) => {
      const ctx = scope.context;
      const maxBarWidth = this.barWidthMax;
      if (maxBarWidth <= 0) return;
      const scale = (vol: number) => (this.maxVol > 0 ? (vol / this.maxVol) * maxBarWidth : 0);

      // Líneas horizontal del Value Area (dashed)
      const yVaHigh = this.priceToCoord(this.vaHigh);
      const yVaLow = this.priceToCoord(this.vaLow);
      if (yVaHigh !== null) {
        ctx.save();
        ctx.strokeStyle = TV_PALETTE.vaStrong;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(this.startX, yVaHigh as number);
        ctx.lineTo(this.endX, yVaHigh as number);
        ctx.stroke();
        ctx.restore();
      }
      if (yVaLow !== null) {
        ctx.save();
        ctx.strokeStyle = TV_PALETTE.vaStrong;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(this.startX, yVaLow as number);
        ctx.lineTo(this.endX, yVaLow as number);
        ctx.stroke();
        ctx.restore();
      }

      // Histograma horizontal: cada fila es una barra desde el lado
      // izquierdo (right edge hacia el centro del chart, igual que TV).
      // Las barras MENOS anchas (volumen menor de VA) son translúcidas
      // (varyan dentro del VA: tono azul sólido), las de fuera del VA
      // son grises translúcidas.
      //
      // Modos `volume`:
      //   - "total" → barra continua, color VA/POC/outside estándar.
      //   - "up"    → sólo dibuja la parte bullish (verde) de cada fila.
      //   - "down"  → sólo dibuja la parte bearish (rojo) de cada fila.
      // Para "up"/"down", el máximo de referencia para escala se sigue
      // basando en totalVol (no recalibrar; queda más estable).
      //
      // `rowSize` (1..5) → shrink vertical de la barra dentro de su fila.
      // TV Pro muestra barras más delgadas verticalmente cuando rowSize=1.
      for (const r of this.rows) {
        const yMid = this.priceToCoord(r.mid);
        if (yMid === null) continue;
        const drawVol =
          this.volume === "up"
            ? r.upVol
            : this.volume === "down"
              ? r.downVol
              : r.volume;
        const w = scale(drawVol);
        if (w <= 0) continue;
        // La fila ocupa el rango [yTop, yBottom] en Y, con un margen entre barras.
        const halfHeightPx = Math.max(1, ((r.hi - r.lo) / 2) * 1);
        const yTop = this.priceToCoord(r.hi) as number | null;
        const yBot = this.priceToCoord(r.lo) as number | null;
        const y1 = typeof yTop === "number" ? yTop : (yMid as number) - halfHeightPx;
        const y2 = typeof yBot === "number" ? yBot : (yMid as number) + halfHeightPx;
        // Margen vertical: rowSize 1..5 → 50%..10% de aire entre barras.
        // rowSize=5 casi rellena la fila entera; rowSize=1 deja barras finas.
        const rowH = Math.abs(y2 - y1);
        const shrink = 1 - (this.rowSize - 1) * 0.15; // 1.0 (size 1) → 0.4 (size 5)
        const barH = Math.max(1, Math.min(rowH - 1, rowH * shrink));
        const yMin = Math.min(y1, y2) + (rowH - barH) / 2;
        const yMax = yMin + barH;
        const [x1, x2] = this.barCoords(w);
        let color: string;
        // Opacidad: POC sólida, dentro del Value Area bastante opaca,
        // fuera del Value Area más tenue pero visible. Estilo TV Pro.
        let alpha: number;
        if (this.volume === "up") {
          color = r.isPoc ? TV_PALETTE.pocDim : r.inValueArea ? TV_PALETTE.upVa : TV_PALETTE.upOutside;
        } else if (this.volume === "down") {
          color = r.isPoc ? TV_PALETTE.pocDim : r.inValueArea ? TV_PALETTE.downVa : TV_PALETTE.downOutside;
        } else if (r.isPoc) {
          color = TV_PALETTE.pocDim;
        } else if (r.inValueArea) {
          color = TV_PALETTE.va;
        } else {
          color = TV_PALETTE.outside;
        }
        if (r.isPoc) {
          alpha = 1.0;
        } else if (r.inValueArea) {
          alpha = 0.85;
        } else {
          alpha = 0.6;
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(x1, yMin + 0.5, x2 - x1, yMax - yMin - 1);
        ctx.globalAlpha = 1.0;
        // Border leve para visual de TV Pro
        if (r.isPoc) {
          ctx.strokeStyle = TV_PALETTE.poc;
          ctx.lineWidth = 1;
          ctx.strokeRect(x1 + 0.5, yMin + 0.5, x2 - x1 - 1, yMax - yMin - 1);
        }
      }

      // Línea sólida del POC (más visible que las barras)
      const yPoc = this.priceToCoord(this.pocPrice);
      if (yPoc !== null) {
        ctx.save();
        ctx.strokeStyle = TV_PALETTE.poc;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.startX, yPoc as number);
        ctx.lineTo(this.endX, yPoc as number);
        ctx.stroke();
        // Label "POC <price>" pegado al eje del lado activo.
        // Sólo se dibuja si `statusLine` es true (configurable desde
        // Settings del indicador).
        if (this.statusLine) {
          // IMPORTANTE: con useMediaCoordinateSpace las medidas del texto
          // (measureText) son en CSS px, y el contexte está pre-escalado por
          // horizontalPixelRatio. Por eso el cálculo de `labelLeft` se hace
          // en CSS coords directamente.  Para side="right" el label se
          // posiciona DENTRO del chart (a la izquierda de endX), con un
          // pequeño margen para que no choque contra el eje de precio.
          ctx.font = "bold 11px sans-serif";
          const label = `POC ${formatPrice(this.pocPrice, this.precision)}`;
          const m = ctx.measureText(label);
          // Ancho del texto en CSS px. Usamos el bounding box real si está
          // disponible, si no, `m.width` (que para sans-serif 11px es
          // decente).  Math.max(20, ...) como floor por si el font todavía
          // no cargó (caso raro: FontFace API async) y measureText da 0 o
          // muy poco.
          const textWidth = Math.max(
            20,
            Math.ceil(
              (m as { actualBoundingBoxRight?: number }).actualBoundingBoxRight !=
                null
                ? ((m as { actualBoundingBoxRight: number }).actualBoundingBoxRight -
                    (m as { actualBoundingBoxLeft: number }).actualBoundingBoxLeft)
                : m.width,
            ),
          );
          const anchor = this.labelAnchor();
          // Padding interna del label (left + right) y margen para que el
          // label NO toque el borde con el price scale (donde lo taparía el
          // canvas del eje). El `edgeMargin` grande (12px) deja aire extra
          // del lado del eje: en alguns DPIs / paddings internos del eje,
          // el canvas del priceScale puede comerse hasta 10-12px del borde
          // del plot area. 12px asegura que el último dígito se vea entero.
          const padX = 6;
          const edgeMargin = 12;
          const totalWidth = textWidth + padX * 2;
          let labelLeft: number;
          if (this.side === "right") {
            // Pegado al eje derecho, dentro del chart. `endX` = borde derecho
            // del plot area (justo antes del price scale).  El label ocupa
            // `totalWidth` px hacia la izquierda, dejando `edgeMargin` de
            // aire extra para que el último carácter no se meta en el eje.
            labelLeft = anchor - totalWidth - edgeMargin;
          } else {
            labelLeft = anchor + edgeMargin;
          }
          // Fondo del label (naranja POC)
          ctx.fillStyle = TV_PALETTE.poc;
          ctx.fillRect(labelLeft, (yPoc as number) - 9, totalWidth, 18);
          // Texto del label (color oscuro para contraste contra fondo naranja)
          ctx.fillStyle = "#0b0e15";
          ctx.textBaseline = "middle";
          ctx.textAlign = "left";
          ctx.fillText(label, labelLeft + padX, (yPoc as number) + 0.5);
        }
        ctx.restore();
      }
    });
  }
}

class VolumeProfilePaneView implements IPrimitivePaneView {
  private result: VprResult | null = null;
  private paneWidth = 0;
  private priceToCoord: PriceToCoordinateConverter = () => null;
  private visible = true;
  private startX = 0;
  private endX = 0;
  private precision: number | null = null;

  updateData(result: VprResult | null) {
    this.result = result;
  }
  setLayout(
    paneWidth: number,
    priceToCoord: PriceToCoordinateConverter,
    startX: number,
    endX: number,
  ) {
    this.paneWidth = paneWidth;
    this.priceToCoord = priceToCoord;
    this.startX = startX;
    this.endX = endX;
  }
  setVisible(v: boolean) {
    this.visible = v;
  }
  setPrecision(p: number | null) {
    this.precision = p;
  }
  zOrder(): "top" | "normal" | "bottom" {
    return "top";
  }
  renderer(): IPrimitivePaneRenderer | null {
    if (!this.result || !this.visible) return null;
    // Ancho máximo de las barras del histograma = ~45% del ancho disponible
    // (el plot area entre startX y endX). Importante: el cálculo se basa en
    // (endX - startX) — NO en paneWidth total — porque las barras se anclan a
    // `endX` (que ya ES el borde derecho del plot area, sin incluir el
    // priceScale). De usar `paneWidth` (que incluye el priceScale) el `w`
    // máximo resultaría mayor que el espacio visible y el profile se
    // extendería cubriendo velas recientes (lo que se veía como "el profile
    // está en 14/22-jul" en vez de "pegado al eje derecho").
    const availableWidth = Math.max(0, this.endX - this.startX);
    const barWidthMax = Math.max(40, Math.min(availableWidth * 0.45, availableWidth - 20));
    return new VolumeProfileRenderer({
      rows: this.result.rows,
      startX: this.startX,
      endX: this.endX,
      paneWidth: this.paneWidth,
      paneHeight: 0,
      maxVol: this.result.maxVol,
      pocPrice: this.result.poc,
      vaHigh: this.result.vaHigh,
      vaLow: this.result.vaLow,
      visible: this.visible,
      priceToCoord: this.priceToCoord,
      barWidthMax,
      side: this.result.side,
      precision: this.precision,
      volume: this.result.volume,
      rowSize: this.result.rowSize,
      statusLine: this.result.statusLine,
    });
  }
}

// Pequeño formateador de precio para el label del POC. Formato
// Latinoamericano/España: miles con punto y decimal con coma, ej:
// "63.234,56" (BTC, precision 2).  Para activos de precio < 100 usamos
// más decimales (XRP con precision 4-6: "1,4523").  Si se pasa
// `precision` explícito (de getSymbolPrecision del símbolo activo),
// usamos ese; si no, fallback por rango.
function formatPrice(p: number, precision?: number | null): string {
  if (!isFinite(p) || p <= 0) return "0";
  // Si recibimos precision (del símbolo activo), respetarlo.
  if (typeof precision === "number" && precision >= 0) {
    if (p >= 1000) {
      return p.toLocaleString("es-AR", {
        minimumFractionDigits: Math.min(precision, 2),
        maximumFractionDigits: precision,
        useGrouping: true,
      });
    }
    return p.toLocaleString("es-AR", {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
      useGrouping: false,
    });
  }
  // Fallback por rango
  if (p >= 1000) {
    return p.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  }
  if (p >= 1) {
    return p.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: false,
    });
  }
  if (p >= 0.01) {
    return p.toLocaleString("es-AR", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
      useGrouping: false,
    });
  }
  return p.toLocaleString("es-AR", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
    useGrouping: false,
  });
}

// ──────────────────────────────────────────────────────────────
// VolumeProfilePrimitive — ISeriesPrimitive estándar lightweight-charts v5.
// ──────────────────────────────────────────────────────────────
export class VolumeProfilePrimitive implements ISeriesPrimitive<Time> {
  private paneView: VolumeProfilePaneView;
  private isAttached = false;
  private chart: IChartApi | null = null;
  private series: ISeriesApi<"Candlestick"> | null = null;
  private requestUpdate: (() => void) | null = null;
  private currentResult: VprResult | null = null;
  private priceScale: IPriceScaleApi | null = null;
  private precision: number | null = null;

  constructor() {
    this.paneView = new VolumeProfilePaneView();
  }

  attached(param: SeriesAttachedParameter<Time, "Candlestick">): void {
    this.chart = param.chart as IChartApi;
    this.series = param.series as ISeriesApi<"Candlestick">;
    this.requestUpdate = param.requestUpdate;
    try {
      this.priceScale = this.series.priceScale();
    } catch {
      this.priceScale = null;
    }
    this.isAttached = true;
  }
  detached(): void {
    this.isAttached = false;
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
    this.priceScale = null;
  }

  /** Recibe las velas visibles y recalcula el profile. */
  setCandles(candles: Candle[], opts: VprOptions) {
    const result = computeVpr(candles, opts);
    this.currentResult = result;
    this.precision = opts.precision ?? null;
    this.paneView.updateData(result);
    this.paneView.setPrecision(this.precision);
    if (this.requestUpdate) this.requestUpdate();
  }

  setVisible(v: boolean) {
    this.paneView.setVisible(v);
    if (this.requestUpdate) this.requestUpdate();
  }

  /** Devuelve el resultado actual del profile (POC, VA, etc.) para mostrar en pill. */
  getResult(): VprResult | null {
    return this.currentResult;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    if (this.isAttached && this.series && this.chart) {
      try {
        const ts = this.chart.timeScale();
        // Ancho del área de datos (velas) — NO incluye el priceScale.
        // En lightweight-charts v5: `timeScale().width()` retorna el ancho
        // del área horizontal donde viven las velas; el priceScale
        // derecho se dibuja adicionalmente, fuera de este rango.
        const dataWidth = ts.width();
        // Ancho del eje de precio derecho (lo necesitamos para que las
        // barras NO se dibujen detrás/encima del eje cuando side="right").
        let rightPsWidth = 0;
        try {
          rightPsWidth = this.chart.priceScale("right").width();
        } catch {}
        // Ancho total del pane 0 (chart completo). Lo usamos como paneWidth
        // para que el renderer sepa los límites del área de dibujo.
        const paneWidth = dataWidth + rightPsWidth;
        // El Volume Profile se ancla al borde del chart que está DONDE el eje
        // de precio, NO al borde exterior del price scale. Igual que
        // TradingView Pro: las barras crecen desde el lado del eje de precio
        // hacia adentro del chart, dejando el eje siempre visible.
        //
        // Para side="right":
        //   startX = 0 (borde izquierdo del área de velas)
        //   endX   = dataWidth (borde derecho del área de velas, pegado al eje)
        // Las barras con [endX - w, endX] quedan pegadas al eje derecho.
        //
        // Para side="left":
        //   startX = 0, endX = dataWidth — las barras con [startX, startX + w]
        //   quedan pegadas al eje izquierdo (cuando hay uno).
        const side = this.currentResult?.side ?? "right";
        const startX = 0;
        const endX = dataWidth;
        const converter = (price: number): Coordinate | null => {
          const y = this.series?.priceToCoordinate(price);
          return y as Coordinate | null;
        };
        this.paneView.setLayout(paneWidth, converter, startX, endX);
        void side;
      } catch {}
    }
    return [this.paneView as unknown as IPrimitivePaneView];
  }
}
