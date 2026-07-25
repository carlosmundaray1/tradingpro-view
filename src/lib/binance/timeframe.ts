import type { Timeframe } from "./types";

const MS_PER_SEC = 1000;
const MS_PER_MIN = 60 * MS_PER_SEC;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": MS_PER_MIN,
  "3m": 3 * MS_PER_MIN,
  "5m": 5 * MS_PER_MIN,
  "15m": 15 * MS_PER_MIN,
  "30m": 30 * MS_PER_MIN,
  "1h": MS_PER_HOUR,
  "2h": 2 * MS_PER_HOUR,
  "4h": 4 * MS_PER_HOUR,
  "6h": 6 * MS_PER_HOUR,
  "8h": 8 * MS_PER_HOUR,
  "12h": 12 * MS_PER_HOUR,
  "1d": MS_PER_DAY,
  "3d": 3 * MS_PER_DAY,
  "1w": 7 * MS_PER_DAY,
  "1M": 30 * MS_PER_DAY,
};

export function timeframeMs(tf: Timeframe): number {
  return TIMEFRAME_MS[tf] ?? MS_PER_MIN;
}

export function candleDurationMs(tf: Timeframe): number {
  return TIMEFRAME_MS[tf] ?? MS_PER_MIN;
}

/** Devuelve el tiempo de cierre de la vela actualmente en formación.
 *  Las velas de Binance abren al inicio del intervalo (alineado a epoch UTC)
 *  y cierran `duration` ms después. Por ejemplo, un 1h alineado a las
 *  12:00:00 UTC abre a 12:00 y cierra a 13:00. */
export function candleCloseTime(tf: Timeframe, lastCandleOpenTimeSec: number): number {
  const dur = candleDurationMs(tf);
  const openMs = lastCandleOpenTimeSec * MS_PER_SEC;
  return openMs + dur;
}

/** Formatea los ms restantes como un countdown estilo TradingView Pro.
 *  - Para timeframes < 1h muestra "M:SS" (ej: 4:23, 0:07).
 *  - Para timeframes >= 1h muestra "HH:MM:SS" (ej: 2:45:30).
 *  - Para timeframes >= 1d muestra "Dd HH:MM" si supera un día.
 *  Devuelve la string formateada o null si el input es inválido. */
export function formatCountdown(msRemaining: number, tf: Timeframe): string | null {
  if (!isFinite(msRemaining) || msRemaining < 0) return null;
  const totalSec = Math.floor(msRemaining / MS_PER_SEC);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const tfDur = candleDurationMs(tf);

  if (tfDur < MS_PER_HOUR) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
  if (tfDur < MS_PER_DAY) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  if (days > 0) {
    return `${days}d ${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
