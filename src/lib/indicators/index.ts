import type { Candle } from "@/lib/binance/types";

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

/**
 * Output genérico de cualquier indicador casteable desde el handler.
 * Cada serie devuelve un array de puntos {time, value} indexado por
 * la key declarada en el descriptor (`series[].key`).
 */
export type IndicatorResult = Record<string, IndicatorPoint[]>;

/* ────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────── */

function smaArr(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period) return out;
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function emaArr(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += closes[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function emaArrSkipNull(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let started = 0;
  let prev = 0;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (started < period) {
      seed += v;
      started++;
      if (started === period) {
        prev = seed / period;
        out[i] = prev;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * RMA (Running Moving Average / Wilder smoothing) — equivalente a `ta.rma(x, len)`
 * en Pine Script. Inicia con la SMA simple de los primeros `period` valores, y a
 * partir del siguiente aplica la recursión `prev = (prev*(period-1) + x) / period`.
 *
 * Diferencia con EMA:
 *   - EMA: alpha = 2/(period+1), pondera más el dato reciente (más rápida).
 *   - RMA: alpha = 1/period, pondera uniformemente (más lenta, suave).
 *
 * TradingView usa RMA para el ATR del Keltner Channel dentro del Squeeze
 * Momentum de LazyBear (lo mismo que hace el indicator original de TV). Sin
 * esto, las bandas KC quedan ligeramente más estrechas y la detección de
 * squeeze on/off se desplaza respecto a la referencia original.
 */
function rmaArr(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  // SMA inicial: sumar los primeros `period` valores (indices 0..period-1).
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period] = prev; // primer valor emitido en index = period (inclusive)
  for (let i = period + 1; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

function trueRanges(c: Candle[]): number[] {
  const tr: number[] = new Array(c.length).fill(0);
  for (let i = 0; i < c.length; i++) {
    if (i === 0) tr[i] = c[i].high - c[i].low;
    else
      tr[i] = Math.max(
        c[i].high - c[i].low,
        Math.abs(c[i].high - c[i - 1].close),
        Math.abs(c[i].low - c[i - 1].close),
      );
  }
  return tr;
}

/* ────────────────────────────────────────────────────────────────
 * Individuales
 * ──────────────────────────────────────────────────────────────── */

export function sma(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

export function ema(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += candles[i].close;
  prev /= period;
  out.push({ time: candles[period - 1].time, value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

export function wma(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += candles[i - j].close * (period - j);
    out.push({ time: candles[i].time, value: sum / denom });
  }
  return out;
}

export function vwma(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  for (let i = period - 1; i < candles.length; i++) {
    let pv = 0;
    let v = 0;
    for (let j = 0; j < period; j++) {
      pv += candles[i - j].close * candles[i - j].volume;
      v += candles[i - j].volume;
    }
    out.push({ time: candles[i].time, value: v === 0 ? 0 : pv / v });
  }
  return out;
}

export function hma(candles: Candle[], period: number): IndicatorPoint[] {
  const closes = candles.map((c) => c.close);
  const half = Math.max(1, Math.floor(period / 2));
  const wmaHalf = slidingWMA(closes, half);
  const wmaFull = slidingWMA(closes, period);
  // raw = 2*wmaHalf - wmaFull  (resolved over original times)
  const raw: IndicatorPoint[] = [];
  const startIdx = period - 1;
  for (let i = startIdx; i < candles.length; i++) {
    const f = wmaFull[i];
    const h = wmaHalf[i];
    if (f === null || h === null) continue;
    raw.push({ time: candles[i].time, value: 2 * h - f });
  }
  // hma = WMA(raw, sqrt(period)) – works on raw sequence
  const sqrtP = Math.max(1, Math.floor(Math.sqrt(period)));
  const rawValues = raw.map((p) => p.value);
  const rawTimes = raw.map((p) => p.time);
  const finalW = slidingWMA(rawValues, sqrtP);
  const out: IndicatorPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (finalW[i] !== null) out.push({ time: rawTimes[i], value: finalW[i] as number });
  }
  return out;
}

function slidingWMA(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += values[i - j] * (period - j);
    out[i] = s / denom;
  }
  return out;
}

export function dema(candles: Candle[], period: number): IndicatorPoint[] {
  const e1 = emaArr(candles.map((c) => c.close), period);
  const e1v: number[] = [];
  for (let i = 0; i < e1.length; i++) {
    if (e1[i] !== null) {
      e1v.push(e1[i] as number);
    }
  }
  const e2 = emaArrSkipNull(e1v, period);
  const out: IndicatorPoint[] = [];
  let j = 0;
  for (let i = 0; i < candles.length; i++) {
    if (e1[i] === null) continue;
    const v2 = e2[j];
    if (v2 === null) {
      j++;
      continue;
    }
    out.push({ time: candles[i].time, value: 2 * (e1[i] as number) - (v2 as number) });
    j++;
  }
  return out;
}

export function tema(candles: Candle[], period: number): IndicatorPoint[] {
  const e1 = emaArr(candles.map((c) => c.close), period);
  const e1v: number[] = e1.filter((v) => v !== null) as number[];
  const e2 = emaArrSkipNull(e1v, period);
  const e2v: number[] = e2.filter((v) => v !== null) as number[];
  const e3 = emaArrSkipNull(e2v, period);
  const out: IndicatorPoint[] = [];
  let j = 0;
  let k = 0;
  for (let i = 0; i < candles.length; i++) {
    if (e1[i] === null) continue;
    const v2 = e2[j];
    if (v2 === null) {
      j++;
      continue;
    }
    const v3 = e3[k];
    if (v3 === null) {
      j++;
      k++;
      continue;
    }
    out.push({
      time: candles[i].time,
      value: 3 * (e1[i] as number) - 3 * (v2 as number) + (v3 as number),
    });
    j++;
    k++;
  }
  return out;
}

export function vwap(candles: Candle[], _period?: number): IndicatorPoint[] {
  void _period;
  // VWAP anchored desde la primer vela del array (estilo TV "anchored VWAP")
  const out: IndicatorPoint[] = [];
  let cumPV = 0;
  let cumV = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume;
    cumV += c.volume;
    out.push({ time: c.time, value: cumV === 0 ? c.close : cumPV / cumV });
  }
  return out;
}

export function bollinger(
  candles: Candle[],
  period: number,
  mult: number,
): IndicatorResult {
  const closes = candles.map((c) => c.close);
  const ma = smaArr(closes, period);
  const upper: IndicatorPoint[] = [];
  const middle: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    const m = ma[i];
    if (m === null) continue;
    let sum = 0;
    for (let j = 0; j < period; j++) sum += (closes[i - j] - m) ** 2;
    const sd = Math.sqrt(sum / period);
    const t = candles[i].time;
    middle.push({ time: t, value: m });
    upper.push({ time: t, value: m + mult * sd });
    lower.push({ time: t, value: m - mult * sd });
  }
  return { upper, middle, lower };
}

export function atr(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  const tr = trueRanges(candles);
  const e = emaArrSkipNull(tr, period);
  for (let i = 0; i < candles.length; i++) {
    if (e[i] !== null) out.push({ time: candles[i].time, value: e[i] as number });
  }
  return out;
}

export function keltner(
  candles: Candle[],
  period: number,
  atrPeriod: number,
  mult: number,
): IndicatorResult {
  const closes = candles.map((c) => c.close);
  const ma = emaArr(closes, period);
  const tr = trueRanges(candles);
  const atrEma = emaArrSkipNull(tr, atrPeriod);
  const upper: IndicatorPoint[] = [];
  const middle: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    const m = ma[i];
    const a = atrEma[i];
    if (m === null || a === null) continue;
    const t = candles[i].time;
    middle.push({ time: t, value: m });
    upper.push({ time: t, value: m + mult * a });
    lower.push({ time: t, value: m - mult * a });
  }
  return { upper, middle, lower };
}

export function rsi(candles: Candle[], period = 14): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  let rs = loss === 0 ? 100 : gain / loss;
  out.push({ time: candles[period].time, value: 100 - 100 / (1 + rs) });
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    rs = loss === 0 ? 100 : gain / loss;
    out.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
  }
  return out;
}

export function stochastic(
  candles: Candle[],
  kPeriod: number,
  dPeriod: number,
  smooth: number,
): IndicatorResult {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const rawK: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = 0; j < kPeriod; j++) {
      if (highs[i - j] > hh) hh = highs[i - j];
      if (lows[i - j] < ll) ll = lows[i - j];
    }
    const denom = hh - ll;
    rawK[i] = denom === 0 ? 50 : ((closes[i] - ll) / denom) * 100;
  }
  const ks = smoothValues(rawK, smooth);
  const ds = smoothValues(ks, dPeriod);
  const k: IndicatorPoint[] = [];
  const d: IndicatorPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (ks[i] !== null) k.push({ time: candles[i].time, value: ks[i] as number });
    if (ds[i] !== null) d.push({ time: candles[i].time, value: ds[i] as number });
  }
  return { k, d };
}

function smoothValues(vals: (number | null)[], period: number): (number | null)[] {
  if (period <= 1) return vals.slice();
  const out: (number | null)[] = new Array(vals.length).fill(null);
  let count = 0;
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === null) continue;
    sum += vals[i] as number;
    count++;
    if (count > period) {
      sum -= vals[i - period] as number;
      count--;
    }
    if (count === period) out[i] = sum / period;
  }
  return out;
}

export function macd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signal = 9,
): MACDPoint[] {
  if (candles.length < slow + signal) return [];
  const emaFast = ema(candles, fast);
  const emaSlow = ema(candles, slow);
  const fastByTime = new Map(emaFast.map((p) => [p.time, p.value]));
  const macdLine: IndicatorPoint[] = [];
  for (const p of emaSlow) {
    const f = fastByTime.get(p.time);
    if (f !== undefined) macdLine.push({ time: p.time, value: f - p.value });
  }
  const synth: Candle[] = macdLine.map((p) => ({
    time: p.time,
    open: p.value,
    high: p.value,
    low: p.value,
    close: p.value,
    volume: 0,
  }));
  const sig = ema(synth, signal);
  const sigByTime = new Map(sig.map((p) => [p.time, p.value]));
  const out: MACDPoint[] = [];
  for (const p of macdLine) {
    const s = sigByTime.get(p.time);
    if (s === undefined) continue;
    out.push({ time: p.time, macd: p.value, signal: s, histogram: p.value - s });
  }
  return out;
}

export function adx(candles: Candle[], period: number): IndicatorResult {
  const len = candles.length;
  const out: IndicatorResult = { adx: [], plusDI: [], minusDI: [] };
  if (len <= period + 1) return out;

  // Cálculo del ADX siguiendo EXACTAMENTE la fórmula de TradingView/Pine Script
  //   (RMA / Wilder smoothing) — no la versión "sumN" erronea anterior.
  //
  // Algoritmo:
  //   tr[i] = max(high-low, |high-prevClose|, |low-prevClose|)
  //   plusDM[i]  = up > down && up > 0 ? up  : 0   (up = high - prevHigh)
  //   minusDM[i] = down > up && down > 0 ? down : 0 (down = prevLow - low)
  //   atrRMA     = rma(tr,      period)
  //   plusRMA    = rma(plusDM,  period)
  //   minusRMA   = rma(minusDM, period)
  //   plusDI     = plusRMA  / atrRMA * 100
  //   minusDI    = minusRMA / atrRMA * 100
  //   dx         = |plusDI - minusDI| / (plusDI + minusDI) * 100
  //   adx        = rma(dx, period)
  //
  // RMA (lobster Bearish MA / Wilder smoothing) se inicializa con la SMA
  // simple de los primeros `period` valores, y los siguientes son recursivos:
  //   prev = (prev * (period - 1) + x) / period
  //
  // Esto produce valores IDENTICOS a TradingView, donde ADX arranca en 0
  // (no en 23) y crece a medida que hay trending. La línea "threshold 23"
  // que se dibuja encima es sólo una referencia visual del usuario.

  const tr: number[] = new Array(len).fill(0);
  const plusDM: number[] = new Array(len).fill(0);
  const minusDM: number[] = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    if (i === 0) {
      tr[0] = candles[0].high - candles[0].low;
      continue;
    }
    const pc = candles[i - 1].close;
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - pc),
      Math.abs(candles[i].low - pc),
    );
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }

  // RMA: devuelve array mismo length; null si no hay suficiente data.
  // RMA(period) en TradingView empieza a emitir en el índice `period` (1-based),
  // es decir, en index `period` (0-based)iendo INCLUSIVE de (period-1) a (period-1)?
  // Es más simple: array de length n, primer valor útil en index = period (0-based).
  function rma(values: number[], period: number): (number | null)[] {
    const out: (number | null)[] = new Array(values.length).fill(null);
    if (values.length <= period) return out;
    // SMA inicial: sumar los primeros `period` valores (0..period-1)
    let prev = 0;
    for (let i = 0; i < period; i++) prev += values[i];
    prev /= period;
    out[period] = prev;
    for (let i = period + 1; i < values.length; i++) {
      prev = (prev * (period - 1) + values[i]) / period;
      out[i] = prev;
    }
    return out;
  }

  const atrR = rma(tr, period);
  const plusR = rma(plusDM, period);
  const minusR = rma(minusDM, period);

  const dx: (number | null)[] = new Array(len).fill(null);
  for (let i = period; i < len; i++) {
    if (atrR[i] === null || plusR[i] === null || minusR[i] === null) continue;
    const av = atrR[i] as number;
    const pv = plusR[i] as number;
    const mv = minusR[i] as number;
    if (av === 0) continue;
    const pdi = (pv / av) * 100;
    const mdi = (mv / av) * 100;
    const denom = Math.abs(pdi + mdi);
    dx[i] = denom === 0 ? 0 : (Math.abs(pdi - mdi) / denom) * 100;
  }

  // ADX = RMA(dx, period) en el sub-conjunto de valores válidos de dx.
  // Pine Script: ta.rma(dx, len) arranca con la SMA de los primeros `period` DX no-NaN.
  // Iterar sólo sobre indices donde dx !== null:
  const validIdx: number[] = [];
  for (let i = 0; i < len; i++) if (dx[i] !== null) validIdx.push(i);
  const adxArr: (number | null)[] = new Array(len).fill(null);
  if (validIdx.length >= period) {
    let prev = 0;
    for (let k = 0; k < period; k++) prev += dx[validIdx[k]] as number;
    prev /= period;
    adxArr[validIdx[period - 1]] = prev;
    for (let k = period; k < validIdx.length; k++) {
      prev = (prev * (period - 1) + (dx[validIdx[k]] as number)) / period;
      adxArr[validIdx[k]] = prev;
    }
  }

  for (let i = 0; i < len; i++) {
    if (atrR[i] === null || plusR[i] === null || minusR[i] === null) continue;
    const av = atrR[i] as number;
    // Skip velas invalidas (NaN/Infinity) que pueden venir del WS cuando
    // Binance envia velas en formacion con campos vacios o de ingestiones
    // parciales. Sin este check, NaN se propaga a DI y al ADX, y el chart
    // muestra valores basura como 3.07 o -2.64 en el pill del indicador.
    if (!isFinite(av)) continue;
    const pv = plusR[i] as number;
    const mv = minusR[i] as number;
    if (!isFinite(pv) || !isFinite(mv)) continue;
    if (av === 0) continue;
    const pdi = (pv / av) * 100;
    const mdi = (mv / av) * 100;
    if (!isFinite(pdi) || !isFinite(mdi)) continue;
    out.plusDI.push({ time: candles[i].time, value: pdi });
    out.minusDI.push({ time: candles[i].time, value: mdi });
    if (adxArr[i] !== null) {
      const avx = adxArr[i] as number;
      // Filtrar NaN/Infinity y out-of-range (ADX deberia estar en [0,100]).
      if (isFinite(avx) && avx >= 0 && avx <= 100) {
        out.adx.push({ time: candles[i].time, value: avx });
      }
    }
  }
  return out;
}

export function cci(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  for (let i = period - 1; i < candles.length; i++) {
    let tpSum = 0;
    for (let j = 0; j < period; j++) {
      const c = candles[i - j];
      tpSum += (c.high + c.low + c.close) / 3;
    }
    const tp = tpSum / period;
    let devSum = 0;
    for (let j = 0; j < period; j++) {
      const c = candles[i - j];
      devSum += Math.abs((c.high + c.low + c.close) / 3 - tp);
    }
    const dev = devSum / period;
    const currTp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    out.push({
      time: candles[i].time,
      value: dev === 0 ? 0 : (currTp - tp) / (0.015 * dev),
    });
  }
  return out;
}

export function williamsR(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = 0; j < period; j++) {
      if (candles[i - j].high > hh) hh = candles[i - j].high;
      if (candles[i - j].low < ll) ll = candles[i - j].low;
    }
    const denom = hh - ll;
    out.push({
      time: candles[i].time,
      value: denom === 0 ? -50 : ((hh - candles[i].close) / denom) * -100,
    });
  }
  return out;
}

export function mfi(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length <= period) return out;
  const tp: number[] = candles.map((c) => (c.high + c.low + c.close) / 3);
  const rmf: number[] = tp.map((v, i) => v * candles[i].volume);
  let pos = 0;
  let neg = 0;
  for (let i = 1; i <= period; i++) {
    const flow = rmf[i];
    if (tp[i] > tp[i - 1]) pos += flow;
    else neg += flow;
  }
  let mfi = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  out.push({ time: candles[period].time, value: mfi });
  for (let i = period + 1; i < candles.length; i++) {
    const flow = rmf[i];
    let prevPos = 0;
    let prevNeg = 0;
    const oldFlow = rmf[i - period];
    if (tp[i - period] > tp[i - period - 1]) prevPos = oldFlow;
    else prevNeg = oldFlow;
    // remove oldest
    pos -= prevPos;
    neg -= prevNeg;
    // add new
    if (tp[i] > tp[i - 1]) pos += flow;
    else neg += flow;
    if (pos < 0) pos = 0;
    if (neg < 0) neg = 0;
    mfi = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
    out.push({ time: candles[i].time, value: mfi });
  }
  return out;
}

export function obv(candles: Candle[]): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length === 0) return out;
  let acc = 0;
  out.push({ time: candles[0].time, value: 0 });
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) acc += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) acc -= candles[i].volume;
    out.push({ time: candles[i].time, value: acc });
  }
  return out;
}

export function psar(
  candles: Candle[],
  step: number,
  max: number,
): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < 2) return out;
  let af = step;
  let ep = candles[0].high;
  let sar = candles[0].low;
  let trend: 1 | -1 = 1;
  out.push({ time: candles[0].time, value: sar });
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    let newSar = sar + af * (ep - sar);
    if (trend === 1) {
      if (c.low < newSar) {
        // flip
        trend = -1;
        newSar = ep;
        ep = c.low;
        af = step;
      } else {
        if (c.high > ep) {
          ep = c.high;
          af = Math.min(af + step, max);
        }
        // sar must be below prior 2 lows
        const priorLow1 = candles[i - 1].low;
        const priorLow2 = candles[Math.max(0, i - 2)].low;
        if (newSar > priorLow1) newSar = priorLow1;
        if (newSar > priorLow2) newSar = priorLow2;
      }
    } else {
      if (c.high > newSar) {
        trend = 1;
        newSar = ep;
        ep = c.high;
        af = step;
      } else {
        if (c.low < ep) {
          ep = c.low;
          af = Math.min(af + step, max);
        }
        const priorHigh1 = candles[i - 1].high;
        const priorHigh2 = candles[Math.max(0, i - 2)].high;
        if (newSar < priorHigh1) newSar = priorHigh1;
        if (newSar < priorHigh2) newSar = priorHigh2;
      }
    }
    sar = newSar;
    out.push({ time: c.time, value: sar });
  }
  return out;
}

export function supertrend(
  candles: Candle[],
  atrPeriod: number,
  mult: number,
): IndicatorResult {
  const out: IndicatorResult = { upper: [], lower: [] };
  if (candles.length <= atrPeriod) return out;
  const tr = trueRanges(candles);
  const atrE = emaArrSkipNull(tr, atrPeriod);
  const upper: (number | null)[] = new Array(candles.length).fill(null);
  const lower: (number | null)[] = new Array(candles.length).fill(null);
  let trend: 1 | -1 = 1;
  for (let i = 0; i < candles.length; i++) {
    if (atrE[i] === null) continue;
    const mid = (candles[i].high + candles[i].low) / 2;
    const a = atrE[i] as number;
    let up = mid + mult * a;
    let low = mid - mult * a;
    if (i > 0 && upper[i - 1] !== null && lower[i - 1] !== null) {
      const prevUp = upper[i - 1] as number;
      const prevLow = lower[i - 1] as number;
      // final upper bands
      up = up < prevUp || candles[i - 1].close > prevUp ? up : prevUp;
      low = low > prevLow || candles[i - 1].close < prevLow ? low : prevLow;
      if (trend === 1) {
        if (candles[i].close < low) trend = -1;
      } else {
        if (candles[i].close > up) trend = 1;
      }
    }
    upper[i] = up;
    lower[i] = low;
    const t = candles[i].time;
    if (trend === 1) {
      out.upper.push({ time: t, value: low });
      out.lower.push({ time: t, value: NaN });
    } else {
      out.upper.push({ time: t, value: NaN });
      out.lower.push({ time: t, value: up });
    }
  }
  return out;
}

export function ichimoku(
  candles: Candle[],
  tenkanP: number,
  kijunP: number,
  senkouBP: number,
  displacement: number,
): IndicatorResult {
  const len = candles.length;
  const tenkan: (number | null)[] = new Array(len).fill(null);
  const kijun: (number | null)[] = new Array(len).fill(null);
  const senkouA: (number | null)[] = new Array(len).fill(null);
  const senkouB: (number | null)[] = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    tenkan[i] = midpoint(candles, i, tenkanP);
    kijun[i] = midpoint(candles, i, kijunP);
    senkouB[i] = midpoint(candles, i, senkouBP);
    if (tenkan[i] !== null && kijun[i] !== null) {
      senkouA[i] = ((tenkan[i] as number) + (kijun[i] as number)) / 2;
    }
  }
  const shift = (arr: (number | null)[]): (number | null)[] => {
    const shifted: (number | null)[] = new Array(len).fill(null);
    for (let i = 0; i < len; i++) {
      const target = i + displacement;
      if (target < len) shifted[target] = arr[i];
    }
    return shifted;
  };
  const sA = shift(senkouA);
  const sB = shift(senkouB);
  // Chikou = close desplazado -displacement
  const result: IndicatorResult = { tenkan: [], kijun: [], senkouA: [], senkouB: [], chikou: [] };
  for (let i = 0; i < len; i++) {
    if (tenkan[i] !== null) result.tenkan.push({ time: candles[i].time, value: tenkan[i] as number });
    if (kijun[i] !== null) result.kijun.push({ time: candles[i].time, value: kijun[i] as number });
    if (sA[i] !== null) result.senkouA.push({ time: candles[i].time, value: sA[i] as number });
    if (sB[i] !== null) result.senkouB.push({ time: candles[i].time, value: sB[i] as number });
    const chikouIdx = i - displacement;
    if (chikouIdx >= 0) {
      result.chikou.push({ time: candles[chikouIdx].time, value: candles[i].close });
    }
  }
  return result;
}

function midpoint(candles: Candle[], i: number, period: number): number | null {
  if (i < period - 1) return null;
  let hh = -Infinity;
  let ll = Infinity;
  for (let j = 0; j < period; j++) {
    if (candles[i - j].high > hh) hh = candles[i - j].high;
    if (candles[i - j].low < ll) ll = candles[i - j].low;
  }
  return (hh + ll) / 2;
}

export function volumeMA(candles: Candle[], period: number): IndicatorResult {
  const vols = candles.map((c) => c.volume);
  const ma = period >= 1 ? smaArr(vols, period) : new Array(candles.length).fill(null);
  return {
    value: candles.map((c) => ({ time: c.time, value: c.volume })),
    ma:
      period >= 1
        ? ma
            .map((v, i) => (v === null ? null : { time: candles[i].time, value: v }))
            .filter((p): p is IndicatorPoint => p !== null)
        : [],
  };
}

/* ────────────────────────────────────────────────────────────────
 * Nuevos indicadores (suite TV Pro)
 * ──────────────────────────────────────────────────────────────── */

/** KAMA — Kaufman Adaptive Moving Average */
export function kama(
  candles: Candle[],
  period: number,
  fastSC: number,
  slowSC: number,
): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const closes = candles.map((c) => c.close);
  const fast = 2 / (fastSC + 1);
  const slow = 2 / (slowSC + 1);
  let prev = closes[period - 1];
  for (let i = period - 1; i < closes.length; i++) {
    if (i < period - 1) continue;
    const change = Math.abs(closes[i] - closes[i - period]);
    let volat = 0;
    for (let j = i - period + 1; j <= i; j++) volat += Math.abs(closes[j] - closes[j - 1]);
    const er = volat === 0 ? 0 : change / volat;
    const sc = Math.pow(er * (fast - slow) + slow, 2);
    if (i === period - 1) {
      prev = closes[i];
    } else {
      prev = prev + sc * (closes[i] - prev);
    }
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

/** FRAMA — Fractal Adaptive Moving Average */
export function frama(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < 2 * period) return out;
  const n = Math.floor(period / 2);
  for (let i = 2 * period - 1; i < candles.length; i++) {
    // Dimensión fractal entre halves (n y n)
    const w1High = Math.max(...candles.slice(i - 2 * n + 1, i - n + 1).map((c) => c.high));
    const w1Low = Math.min(...candles.slice(i - 2 * n + 1, i - n + 1).map((c) => c.low));
    const w2High = Math.max(...candles.slice(i - n + 1, i + 1).map((c) => c.high));
    const w2Low = Math.min(...candles.slice(i - n + 1, i + 1).map((c) => c.low));
    const wHigh = Math.max(w1High, w2High);
    const wLow = Math.min(w1Low, w2Low);
    const w = wHigh - wLow;
    const hl1 = w1High - w1Low || 1e-9;
    const hl2 = w2High - w2Low || 1e-9;
    const dimension = (Math.log(hl1 + hl2) - Math.log(w || 1e-9)) / Math.log(2);
    const alpha = Math.exp(-4.6 * (dimension - 1));
    const clampedAlpha = Math.max(0.1, Math.min(1, alpha));
    const prevClose = i === 2 * period - 1 ? candles[i].close : out[out.length - 1]?.value ?? candles[i].close;
    const framaVal = prevClose + clampedAlpha * (candles[i].close - prevClose);
    out.push({ time: candles[i].time, value: framaVal });
  }
  return out;
}

/** Hull MA variation (simple short/long envelope view) */
export function hullMA(candles: Candle[], period: number): IndicatorPoint[] {
  return hma(candles, period);
}

/** Donchian Channels */
export function donchian(candles: Candle[], period: number): IndicatorResult {
  const out: IndicatorResult = { upper: [], middle: [], lower: [] };
  if (candles.length < period) return out;
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = 0; j < period; j++) {
      if (candles[i - j].high > hh) hh = candles[i - j].high;
      if (candles[i - j].low < ll) ll = candles[i - j].low;
    }
    const t = candles[i].time;
    out.upper.push({ time: t, value: hh });
    out.lower.push({ time: t, value: ll });
    out.middle.push({ time: t, value: (hh + ll) / 2 });
  }
  return out;
}

/** Envelopes (SMA ± %) */
export function envelopes(candles: Candle[], period: number, pct: number): IndicatorResult {
  const out: IndicatorResult = { upper: [], middle: [], lower: [] };
  const s = sma(candles, period);
  const byTime = new Map(s.map((p) => [p.time, p.value]));
  for (const c of candles) {
    const m = byTime.get(c.time);
    if (m === undefined) continue;
    const dev = m * (pct / 100);
    out.middle.push({ time: c.time, value: m });
    out.upper.push({ time: c.time, value: m + dev });
    out.lower.push({ time: c.time, value: m - dev });
  }
  return out;
}

/** Bollinger Bands Width */
export function bbWidth(candles: Candle[], period: number, mult: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const closes = candles.map((c) => c.close);
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += closes[i - j];
    const m = sum / period;
    let variance = 0;
    for (let j = 0; j < period; j++) variance += (closes[i - j] - m) ** 2;
    const sd = Math.sqrt(variance / period);
    out.push({ time: candles[i].time, value: (2 * mult * sd) / (m || 1) });
  }
  return out;
}

/** Standard Deviation */
export function stddev(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const closes = candles.map((c) => c.close);
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += closes[i - j];
    const m = sum / period;
    let varSum = 0;
    for (let j = 0; j < period; j++) varSum += (closes[i - j] - m) ** 2;
    out.push({ time: candles[i].time, value: Math.sqrt(varSum / period) });
  }
  return out;
}

/** Choppiness Index — CI = 100 * log10(sumATR / (Highest-Lowest)) / (n-log10(n)) */
export function choppiness(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const tr = trueRanges(candles);
  const atrSum = slidingSum(tr, period);
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = 0; j < period; j++) {
      if (candles[i - j].high > hh) hh = candles[i - j].high;
      if (candles[i - j].low < ll) ll = candles[i - j].low;
    }
    const range = hh - ll;
    if (range <= 0 || atrSum[i] <= 0) {
      out.push({ time: candles[i].time, value: 50 });
      continue;
    }
    const ci = (100 * Math.log10(atrSum[i] / range)) / Math.log10(period);
    out.push({ time: candles[i].time, value: ci });
  }
  return out;
}

function slidingSum(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(0);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out[i] = sum;
  }
  return out;
}

/** Awesome Oscillator */
export function awesomeOscillator(candles: Candle[], fast: number, slow: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < slow) return out;
  const median = candles.map((c) => (c.high + c.low) / 2);
  const smaFast = smaArr(median, fast);
  const smaSlow = smaArr(median, slow);
  for (let i = 0; i < candles.length; i++) {
    if (smaFast[i] === null || smaSlow[i] === null) continue;
    out.push({ time: candles[i].time, value: (smaFast[i] as number) - (smaSlow[i] as number) });
  }
  return out;
}

/** ROC — Rate of Change */
export function roc(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  for (let i = period; i < candles.length; i++) {
    const prevClose = candles[i - period].close;
    if (prevClose === 0) continue;
    out.push({ time: candles[i].time, value: ((candles[i].close - prevClose) / prevClose) * 100 });
  }
  return out;
}

/** TRIX — Triple EMA ROC */
export function trix(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period * 3) return out;
  const closes = candles.map((c) => c.close);
  const e1 = emaArrSkipNull(closes, period);
  // take e1 values (non-null), recursively apply ema
  const e1NonNull = e1.filter((v) => v !== null) as number[];
  const e2 = emaArrSkipNull(e1NonNull, period);
  const e2NonNull = e2.filter((v) => v !== null) as number[];
  const e3 = emaArrSkipNull(e2NonNull, period);
  // times when e3 is non-null
  let idx = 0;
  const e3ByTime: Map<number, number> = new Map();
  for (let i = 0; i < candles.length; i++) {
    if (e1[i] === null) continue;
    if (e2[idx] === null) {
      idx++;
      continue;
    }
    if (e3[idx] === null) {
      idx++;
      continue;
    }
    e3ByTime.set(candles[i].time, e3[idx] as number);
    idx++;
  }
  let prev = NaN;
  for (const c of candles) {
    const v = e3ByTime.get(c.time);
    if (v === undefined) continue;
    if (!isNaN(prev) && prev !== 0) {
      out.push({ time: c.time, value: ((v - prev) / prev) * 100 });
    }
    prev = v;
  }
  return out;
}

/** CMO — Chande Momentum Oscillator */
export function cmo(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length <= period) return out;
  let sumUp = 0;
  let sumDown = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) sumUp += diff;
    else sumDown -= diff;
  }
  const denom = sumUp + sumDown;
  out.push({ time: candles[period].time, value: denom === 0 ? 0 : ((sumUp - sumDown) / denom) * 100 });
  for (let i = period + 1; i < candles.length; i++) {
    const newDiff = candles[i].close - candles[i - 1].close;
    const oldDiff = candles[i - period].close - candles[i - period - 1].close;
    if (oldDiff >= 0) sumUp -= oldDiff;
    else sumDown -= -oldDiff;
    if (newDiff >= 0) sumUp += newDiff;
    else sumDown -= -newDiff;
    if (sumUp < 0) sumUp = 0;
    if (sumDown < 0) sumDown = 0;
    const d = sumUp + sumDown;
    out.push({ time: candles[i].time, value: d === 0 ? 0 : ((sumUp - sumDown) / d) * 100 });
  }
  return out;
}

/** Coppock Curve — WMA of (RoC1 + RoC2) */
export function coppock(candles: Candle[], roc1: number, roc2: number, wmaP: number): IndicatorPoint[] {
  const r1 = roc(candles, roc1);
  const r2 = roc(candles, roc2);
  const r2ByTime = new Map(r2.map((p) => [p.time, p.value]));
  const sum: IndicatorPoint[] = [];
  for (const p of r1) {
    const v2 = r2ByTime.get(p.time);
    if (v2 === undefined) continue;
    sum.push({ time: p.time, value: p.value + v2 });
  }
  if (sum.length < wmaP) return [];
  const values = sum.map((p) => p.value);
  const times = sum.map((p) => p.time);
  const w = slidingWMA(values, wmaP);
  const out: IndicatorPoint[] = [];
  for (let i = 0; i < values.length; i++) {
    if (w[i] !== null) out.push({ time: times[i], value: w[i] as number });
  }
  return out;
}

/** Squeeze Momentum (LazyBear) — Fórmula EXACTA Pine Script:
 *   linreg(close - avg(avg(highest(high, KC), lowest(low, KC)), sma(close, KC)), KC, 0)
 * Normalizado a % del precio (igual que la implementación Python de TradingLatino).
 * Devuelve: value (momentum normalizado), kcUp/kcDown/kcMid (Keltner Channels),
 *           bbUp/bbDown (Bollinger Bands), squeezeState (0/1/2/3 según valor+delta).
 */
export function squeezeMomentum(
  candles: Candle[],
  bbPeriod: number,
  bbMult: number,
  kcPeriod: number,
  kcMult: number,
): IndicatorResult {
  const len = candles.length;
  const out: IndicatorResult = {
    value: [],
    kcUp: [],
    kcDown: [],
    kcMid: [],
    bbUp: [],
    bbDown: [],
  };
  if (len < Math.max(bbPeriod, kcPeriod) + 1) return out;
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  // SMA(close, kcPeriod) parte de la fórmula
  const smaClose = smaArr(closes, kcPeriod);
  // highest(high, kcPeriod) y lowest(low, kcPeriod) — rolling max/min
  const highestArr: (number | null)[] = new Array(len).fill(null);
  const lowestArr: (number | null)[] = new Array(len).fill(null);
  for (let i = kcPeriod - 1; i < len; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = 0; j < kcPeriod; j++) {
      if (highs[i - j] > hh) hh = highs[i - j];
      if (lows[i - j] < ll) ll = lows[i - j];
    }
    highestArr[i] = hh;
    lowestArr[i] = ll;
  }
  // ATR (Wilder) para Keltner Channels
  const tr = trueRanges(candles);
  // ATR (Wilder/RMA) para Keltner Channels — igual que TradingView/LazyBear.
  // NOTA: NO usar EMA aquí. RMA pondera con alpha=1/period (suave), mientras
  // que EMA usa alpha=2/(period+1) (más reactiva). TradingView usa RMA para
  // el ATR del kc en el Squeeze Momentum LazyBear.
  const atrArr = rmaArr(tr, kcPeriod);
  // Bollinger Bands sobre close
  const smaBb = smaArr(closes, bbPeriod);
  // Diferencia source - center, luego linreg sobre ventana kcPeriod
  let prevMom = NaN;
  for (let i = kcPeriod - 1; i < len; i++) {
    const sm = smaClose[i];
    const hh = highestArr[i];
    const ll = lowestArr[i];
    if (sm === null || hh === null || ll === null || atrArr[i] === null) continue;
    // source - center sobre ventana kcPeriod, donde center[k] = avg(avg(highest[k], lowest[k]), sma(close,kc)[k])
    const vals: number[] = [];
    for (let j = 0; j < kcPeriod; j++) {
      const k = i - kcPeriod + 1 + j;
      if (k < 0) continue;
      const sm2 = smaClose[k];
      const hh2 = highestArr[k];
      const ll2 = lowestArr[k];
      if (sm2 === null || hh2 === null || ll2 === null) continue;
      const c2 = ((hh2 + ll2) / 2 + sm2) / 2;
      vals.push(closes[k] - c2);
    }
    if (vals.length < kcPeriod - 1) continue;
    // Linear regression (Pine linreg(source, length, offset=0))
    const n = vals.length;
    const xMean = (n - 1) / 2;
    const yMean = vals.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let j = 0; j < n; j++) {
      num += (j - xMean) * (vals[j] - yMean);
      den += (j - xMean) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = yMean - slope * xMean;
    let mom = intercept + slope * (n - 1);
    // Normalizar a % del precio (igual que el Python)
    const cl = closes[i] || 1;
    if (cl !== 0) mom = (mom / cl) * 100;
    // squeezeState: 0=lime, 1=green, 2=red, 3=maroon — según valor+delta
    let state: number;
    if (mom >= 0) {
      state = !isNaN(prevMom) && mom >= prevMom ? 0 : 1; // lime si crece, green si decrece
    } else {
      state = !isNaN(prevMom) && mom < prevMom ? 2 : 3; // red si baja, maroon si sube
    }
    out.value.push({ time: candles[i].time, value: mom, ...{ colorState: state } } as IndicatorPoint & { colorState: number });
    // Keltner Channels (sobre center=SMA(close, kcPeriod))
    const kcMid = sm;
    const atr = atrArr[i] as number;
    out.kcUp.push({ time: candles[i].time, value: kcMid + kcMult * atr });
    out.kcDown.push({ time: candles[i].time, value: kcMid - kcMult * atr });
    out.kcMid.push({ time: candles[i].time, value: kcMid });
    // Bollinger Bands (sobre close)
    const smBbVal = smaBb[i];
    if (smBbVal !== null) {
      let variance = 0;
      for (let j = 0; j < bbPeriod; j++) variance += (closes[i - j] - smBbVal) ** 2;
      const sd = Math.sqrt(variance / bbPeriod);
      out.bbUp.push({ time: candles[i].time, value: smBbVal + bbMult * sd });
      out.bbDown.push({ time: candles[i].time, value: smBbVal - bbMult * sd });
    } else {
      out.bbUp.push({ time: candles[i].time, value: NaN });
      out.bbDown.push({ time: candles[i].time, value: NaN });
    }
    prevMom = mom;
  }
  return out;
}

/** Aroon — Up/Down/Oscillator */
export function aroon(candles: Candle[], period: number): IndicatorResult {
  const out: IndicatorResult = { up: [], down: [], osc: [] };
  if (candles.length < period) return out;
  for (let i = period; i < candles.length; i++) {
    let hhIdx = i - period;
    let llIdx = i - period;
    for (let j = i - period; j <= i; j++) {
      if (candles[j].high > candles[hhIdx].high) hhIdx = j;
      if (candles[j].low < candles[llIdx].low) llIdx = j;
    }
    const up = ((period - (i - hhIdx)) / period) * 100;
    const down = ((period - (i - llIdx)) / period) * 100;
    const t = candles[i].time;
    out.up.push({ time: t, value: up });
    out.down.push({ time: t, value: down });
    out.osc.push({ time: t, value: up - down });
  }
  return out;
}

/** ZigZag — pivotes filtrados por desviación % */
export function zigzag(candles: Candle[], deviationPct: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < 2) return out;
  const threshold = deviationPct / 100;
  let lastPivotIdx = 0;
  let lastPivotPrice = candles[0].close;
  let dir: 1 | -1 | 0 = 0;
  for (let i = 1; i < candles.length; i++) {
    const price = candles[i].close;
    const change = (price - lastPivotPrice) / lastPivotPrice;
    if (dir === 0) {
      if (Math.abs(change) >= threshold) dir = change > 0 ? 1 : -1;
    } else if (dir === 1) {
      if (-change >= threshold) {
        out.push({ time: candles[lastPivotIdx].time, value: lastPivotPrice });
        out.push({ time: candles[i].time, value: price });
        lastPivotIdx = i;
        lastPivotPrice = price;
        dir = -1;
      } else if (price > lastPivotPrice) {
        lastPivotIdx = i;
        lastPivotPrice = price;
      }
    } else {
      if (change >= threshold) {
        out.push({ time: candles[lastPivotIdx].time, value: lastPivotPrice });
        out.push({ time: candles[i].time, value: price });
        lastPivotIdx = i;
        lastPivotPrice = price;
        dir = 1;
      } else if (price < lastPivotPrice) {
        lastPivotIdx = i;
        lastPivotPrice = price;
      }
    }
  }
  return out;
}

/** Accumulation/Distribution */
export function accumulationDistribution(candles: Candle[]): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length === 0) return out;
  let acc = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const range = c.high - c.low;
    const mf = range === 0 ? 0 : ((c.close - c.low) - (c.high - c.close)) / range;
    acc += mf * c.volume;
    out.push({ time: c.time, value: acc });
  }
  return out;
}

/** Chaikin Money Flow */
export function chaikinMoneyFlow(candles: Candle[], period: number): IndicatorPoint[] {  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const mf: number[] = [];
  const vol: number[] = [];
  for (const c of candles) {
    const range = c.high - c.low;
    const mfm = range === 0 ? 0 : ((c.close - c.low) - (c.high - c.close)) / range;
    mf.push(mfm * c.volume);
    vol.push(c.volume);
  }
  let mfSum = 0;
  let vSum = 0;
  for (let i = 0; i < period; i++) {
    mfSum += mf[i];
    vSum += vol[i];
  }
  out.push({ time: candles[period - 1].time, value: vSum === 0 ? 0 : mfSum / vSum });
  for (let i = period; i < candles.length; i++) {
    mfSum += mf[i] - mf[i - period];
    vSum += vol[i] - vol[i - period];
    out.push({ time: candles[i].time, value: vSum === 0 ? 0 : mfSum / vSum });
  }
  return out;
}

/** VIX-like volatility proxy (ATR% close) */
export function vixProxy(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const tr = trueRanges(candles);
  const atr = emaArrSkipNull(tr, period);
  for (let i = 0; i < candles.length; i++) {
    if (atr[i] === null) continue;
    const close = candles[i].close;
    out.push({ time: candles[i].time, value: close === 0 ? 0 : ((atr[i] as number) / close) * 100 });
  }
  return out;
}

/** VWAP Intraday (session-reseteable) — resetea al detectar nuevo día UTC */
export function vwapIntraday(candles: Candle[]): IndicatorResult {
  const out: IndicatorResult = { value: [], upper: [], lower: [], mid: [] };
  if (candles.length === 0) return out;
  let cumPV = 0;
  let cumV = 0;
  let prevDay: number | null = null;
  for (const c of candles) {
    const day = Math.floor(c.time / 86400);
    if (prevDay === null || day !== prevDay) {
      cumPV = 0;
      cumV = 0;
      prevDay = day;
    }
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume;
    cumV += c.volume;
    const vwap = cumV === 0 ? c.close : cumPV / cumV;
    out.value.push({ time: c.time, value: vwap });
    // bands: vwap ± 1 stdev de (tp - vwap)^2 * volume, simplified (rolling session)
    out.mid.push({ time: c.time, value: vwap });
    out.upper.push({ time: c.time, value: vwap * 1.005 });
    out.lower.push({ time: c.time, value: vwap * 0.995 });
  }
  return out;
}

/** Center of Gravity oscillator */
export function cog(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  for (let i = period - 1; i < candles.length; i++) {
    let num = 0;
    let den = 0;
    for (let j = 0; j < period; j++) {
      const price = candles[i - j].close;
      num += (j + 1) * price;
      den += price;
    }
    out.push({ time: candles[i].time, value: den === 0 ? 0 : -num / den });
  }
  return out;
}

/** Detrended Price Oscillator */
export function dpo(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const closes = candles.map((c) => c.close);
  const smaData = smaArr(closes, period);
  const shiftBack = Math.floor(period / 2) + 1;
  for (let i = period + shiftBack - 1; i < candles.length; i++) {
    const ma = smaData[i - shiftBack];
    if (ma === null) continue;
    out.push({ time: candles[i].time, value: closes[i] - ma });
  }
  return out;
}

/** Volumes Ratio — volumen actual / SMA(volumen, period) */
export function volumesRatio(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += candles[i - j].volume;
    const avg = sum / period;
    out.push({ time: candles[i].time, value: avg === 0 ? 0 : candles[i].volume / avg });
  }
  return out;
}

/** Fibonacci EMA envelope (5/8/13/21/55) */
export function fibEMA(candles: Candle[]): IndicatorResult {
  return {
    e5: ema(candles, 5),
    e8: ema(candles, 8),
    e13: ema(candles, 13),
    e21: ema(candles, 21),
    e55: ema(candles, 55),
  };
}

/* ────────────────────────────────────────────────────────────────
 * Volume Profile Visible Range (VPVR) — POC + Value Area
 * ────────────────────────────────────────────────────────────────
 * Replica el "Volume Profile Visible Range" de TradingView Pro:
 * divide el rango de precios [minLow..maxHigh] de las velas visibles
 * en N filas (rows), acumula el volumen de cada vela en las filas que
 * toca (reparto proporcional por intersección high-low), identifica la
 * fila con más volumen = POC, y calcula el Value Area (70% del volumen
 * total) alrededor del POC con el método típico TPO/ACD.
 *
 * Salida:
 *   poc      → precio medio de la fila con más volumen (2 decimales)
 *   vaHigh   → límite superior del Value Area
 *   vaLow    → límite inferior del Value Area
 *   totalVol → volumen total acumulado (para mostrar en pill)
 *   bars     → cantidad de velas analizadas
 *
 * Todos los valores son un único IndicatorPoint al final del rango
 * (time = última vela) para encajar en el tipo IndicatorResult.
 */
export interface VPRParams {
  rows?: number;       // cantidad de filas del profile (default 24)
  valueAreaPct?: number; // porcentaje del value area (default 0.7 = 70%)
  side?: "left" | "right"; // de qué lado del chart se dibuja (default "right")
}

export function vpr(candles: Candle[], params: VPRParams = {}): IndicatorResult {
  const rows = Math.max(4, params.rows ?? 24);
  const vaPct = Math.min(0.99, Math.max(0.5, params.valueAreaPct ?? 0.7));
  const side = params.side === "left" ? "left" : "right";
  const empty: IndicatorResult = {
    poc: [],
    vaHigh: [],
    vaLow: [],
    totalVol: [],
    bars: [],
  };
  if (candles.length === 0) return empty;
  const first = candles[0];
  const last = candles[candles.length - 1];
  // Rango de precios: usar min(low) y max(high) de todas las velas visibles.
  let gMin = first.low;
  let gMax = first.high;
  let totalVol = 0;
  for (const c of candles) {
    if (c.low < gMin) gMin = c.low;
    if (c.high > gMax) gMax = c.high;
    totalVol += c.volume;
  }
  if (gMax <= gMin || totalVol <= 0) return empty;
  // Ancho de cada fila. Repartir el volumen de cada vela proporcionalmente
  // a la intersección con cada fila (price-volume approximation estándar).
  const rowWidth = (gMax - gMin) / rows;
  const volByRow = new Array<number>(rows).fill(0);
  // ценуToRowIndex(price) = floor((price - gMin) / rowWidth), clamp [0, rows-1]
  for (const c of candles) {
    const lo = c.low;
    const hi = c.high;
    // Índices de filas que esta vela toca (con clamp).
    let iLo = Math.floor((lo - gMin) / rowWidth);
    let iHi = Math.floor((hi - gMin) / rowWidth);
    if (iLo < 0) iLo = 0;
    if (iHi > rows - 1) iHi = rows - 1;
    if (iHi < iLo) iHi = iLo;
    // Si la vela toca una sola fila (o varias pero muy angostas), todo el
    // volumen va a la fila correspondiente.
    if (iHi === iLo) {
      volByRow[iLo] += c.volume;
      continue;
    }
    // Reparto proporcional: la vela cruza varias filas. Fracción de solape
    // entre la vela [lo,hi] y cada fila [fMin,fMax] => distribuye c.volume.
    const span = hi - lo;
    if (span <= 0) {
      volByRow[iLo] += c.volume;
      continue;
    }
    for (let i = iLo; i <= iHi; i++) {
      const fMin = gMin + i * rowWidth;
      const fMax = fMin + rowWidth;
      const overlap = Math.max(0, Math.min(hi, fMax) - Math.max(lo, fMin));
      volByRow[i] += (overlap / span) * c.volume;
    }
  }
  // POC = fila con máximo volumen. Precio medio de esa fila.
  let pocIndex = 0;
  let pocVol = -Infinity;
  for (let i = 0; i < rows; i++) {
    if (volByRow[i] > pocVol) {
      pocVol = volByRow[i];
      pocIndex = i;
    }
  }
  const pocPrice = gMin + (pocIndex + 0.5) * rowWidth;
  // Value Area (método ACD): partir del POC e ir agregando filas adyacentes
  // (alternando arriba/abajo) hasta cubrir el pct del volumen total.
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
  const vaHigh = gMin + (vaIdxHi + 1) * rowWidth;
  const vaLow = gMin + vaIdxLo * rowWidth;
  const outPoint = { time: last.time };
  return {
    poc: [{ ...outPoint, value: roundTo(pocPrice, 2) }],
    vaHigh: [{ ...outPoint, value: roundTo(vaHigh, 2) }],
    vaLow: [{ ...outPoint, value: roundTo(vaLow, 2) }],
    totalVol: [{ ...outPoint, value: totalVol }],
    bars: [{ ...outPoint, value: candles.length }],
  };
}

function roundTo(v: number, digits: number): number {
  const p = Math.pow(10, digits);
  return Math.round(v * p) / p;
}

/* ────────────────────────────────────────────────────────────────
 * Dispatch — una sola función para calcular cualquier indicador
 * a partir de su tipo + params.
 * ──────────────────────────────────────────────────────────────── */

export function computeIndicator(
  type: string,
  params: Record<string, number | string | boolean>,
  candles: Candle[],
): IndicatorResult {
  // Helper local: veamos siempre number (los cases numéricos no reciben
  // strings — el único param "select" es `side` del vpr y se usa ad-hoc).
  const n = params as unknown as Record<string, number>;
  switch (type) {
    case "sma":
      return { value: sma(candles, n.period) };
    case "ema":
      return { value: ema(candles, n.period) };
    case "wma":
      return { value: wma(candles, n.period) };
    case "vwma":
      return { value: vwma(candles, n.period) };
    case "hma":
      return { value: hma(candles, n.period) };
    case "dema":
      return { value: dema(candles, n.period) };
    case "tema":
      return { value: tema(candles, n.period) };
    case "vwap":
      return { value: vwap(candles, n.period) };
    case "bbands":
      return bollinger(candles, n.period, n.mult);
    case "kc":
      return keltner(candles, n.period, n.atrPeriod, n.mult);
    case "atr":
      return { value: atr(candles, n.period) };
    case "rsi":
      return { value: rsi(candles, n.period) };
    case "stoch":
      return stochastic(candles, n.kPeriod, n.dPeriod, n.smooth);
    case "macd": {
      const m = macd(candles, n.fast, n.slow, n.signal);
      return {
        macd: m.map((pt) => ({ time: pt.time, value: pt.macd })),
        signal: m.map((pt) => ({ time: pt.time, value: pt.signal })),
        hist: m.map((pt) => ({ time: pt.time, value: pt.histogram })),
      };
    }
    case "adx":
      return adx(candles, n.period);
    case "cci":
      return { value: cci(candles, n.period) };
    case "willr":
      return { value: williamsR(candles, n.period) };
    case "mfi":
      return { value: mfi(candles, n.period) };
    case "obv":
      return { value: obv(candles) };
    case "psar":
      return { value: psar(candles, n.step, n.max) };
    case "supertrend":
      return supertrend(candles, n.atrPeriod, n.mult);
    case "ichimoku":
      return ichimoku(candles, n.tenkan, n.kijun, n.senkouB, n.displacement);
    case "volume":
      return volumeMA(candles, n.period);
    // ── Nuevos indicadores (suite TV Pro) ──
    case "kama":
      return { value: kama(candles, n.period, n.fast, n.slow) };
    case "frama":
      return { value: frama(candles, n.period) };
    case "hullMA":
      return { value: hullMA(candles, n.period) };
    case "donchian":
      return donchian(candles, n.period);
    case "env":
      return envelopes(candles, n.period, n.pct);
    case "bbwidth":
      return { value: bbWidth(candles, n.period, n.mult) };
    case "stddev":
      return { value: stddev(candles, n.period) };
    case "chop":
      return { value: choppiness(candles, n.period) };
    case "ao":
      return { value: awesomeOscillator(candles, n.fast, n.slow) };
    case "roc":
      return { value: roc(candles, n.period) };
    case "trix":
      return { value: trix(candles, n.period) };
    case "cmo":
      return { value: cmo(candles, n.period) };
    case "coppock":
      return { value: coppock(candles, n.roc1, n.roc2, n.wma) };
    case "squeeze":
      return squeezeMomentum(candles, n.bbPeriod, n.bbMult, n.kcPeriod, n.kcMult);
    case "aroon":
      return aroon(candles, n.period);
    case "zigzag":
      return { value: zigzag(candles, n.dev) };
    case "ad":
      return { value: accumulationDistribution(candles) };
    case "cmf":
      return { value: chaikinMoneyFlow(candles, n.period) };
    case "volRatio":
      return { value: volumesRatio(candles, n.period) };
    case "vix":
      return { value: vixProxy(candles, n.period) };
    case "vwapIntraday":
      return vwapIntraday(candles);
    case "cog":
      return { value: cog(candles, n.period) };
    case "dpo":
      return { value: dpo(candles, n.period) };
    case "fibMA":
      return fibEMA(candles);
    case "vpr":
      return vpr(candles, {
        rows: params.rows as number,
        valueAreaPct: ((params.valueAreaPct as number) ?? 70) / 100,
        side: params.side === "left" ? "left" : "right",
      });
    default:
      throw new Error(`Unknown indicator type: ${type}`);
  }
}
