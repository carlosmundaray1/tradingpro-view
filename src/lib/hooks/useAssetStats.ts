"use client";

import { useEffect, useState } from "react";
import { fetchKlinesWithQuote } from "@/lib/binance/rest";

export interface AssetStats {
  /** Rendimientos por periodo (signed %). */
  perf1W: number | null;
  perf1M: number | null;
  perf3M: number | null;
  perf6M: number | null;
  perf1Y: number | null;
  /** Volumen medio 30d en USDT (quoteVolume promedio de los últimos 30 candles
   *  diarios). */
  avg30dQuoteVolume: number | null;
  /** Precio de cierre de la última vela diaria conocida (snapshot referencia). */
  refPrice: number | null;
}

const EMPTY: AssetStats = {
  perf1W: null,
  perf1M: null,
  perf3M: null,
  perf6M: null,
  perf1Y: null,
  avg30dQuoteVolume: null,
  refPrice: null,
};

/** Cache simple en memoria para evitar re-fetchear el mismo símbolo si el
 *  usuario cambia y vuelve. Clave = symbol. TTL ~5 min. */
interface CacheEntry {
  at: number;
  stats: AssetStats;
}
const CACHE_TTL_MS = 5 * 60 * 1000;
const statsCache = new Map<string, CacheEntry>();

/**
 * Computa para un símbolo dado:
 *  - Volumen medio 30d (USDT): promedio aritmético de los quoteVolume de las
 *    últimas 30 velas diarias.
 *  - Rendimientos 1W / 1M / 3M / 6M / 1Y:
 *      1W = (close Hoy − close hace 7d) / close hace 7d
 *      1M = (close Hoy − close hace 30d) / close hace 30d
 *      3M / 6M = similar con 90 / 180 días.
 *      1Y = (close Hoy − close hace 365d) / close hace 365d
 *
 * Fuente: Binance /klines?interval=1d&limit=400 (un único request cubre
 * 1W/1M/3M/6M/1Y y vol30d, ya que 365+30 ≈ 400 velas diarias).
 *
 * El cache TTL 5min mantiene resultados frescos sin golpear Binance en cada
 * render / cambio de símbolo. El hook NO re-fetchea en WS because los
 * rendimientos son snapshots diarios (no tick a tick); el precio actual viene
 * del hook useQuotes, y aquí sólo proveemos los stats históricos.
 */
export function useAssetStats(symbol: string | null): AssetStats {
  const [stats, setStats] = useState<AssetStats>(EMPTY);

  useEffect(() => {
    if (!symbol) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStats(EMPTY);
      return;
    }
    // Cache check
    const cached = statsCache.get(symbol);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStats(cached.stats);
      return;
    }
    let cancelled = false;
    fetchKlinesWithQuote(symbol, "1d", 400)
      .then((candles) => {
        if (cancelled) return;
        const result = computeStats(candles);
        statsCache.set(symbol, { at: Date.now(), stats: result });
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStats(result);
      })
      .catch((e) => {
        console.error("useAssetStats fetch:", e);
        if (!cancelled) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setStats(EMPTY);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return stats;
}

/** Computa los stats a partir de un array de velas diarias (mínimo 365 velas
 *  para 1Y completo; si hay menos, ese rendimiento queda null). */
function computeStats(candles: { close: number; quoteVolume: number }[]): AssetStats {
  if (candles.length === 0) return EMPTY;
  const last = candles[candles.length - 1];
  const refPrice = last.close;
  const idx = (backDays: number) => candles.length - 1 - backDays;
  const perfAt = (backDays: number): number | null => {
    const i = idx(backDays);
    if (i < 0 || i >= candles.length) return null;
    const base = candles[i].close;
    if (!base || base === 0) return null;
    return ((refPrice - base) / base) * 100;
  };
  // Volumen medio 30d (USDT): promedio aritmético de los últimos 30 quoteVolume.
  const tail = candles.slice(-30);
  const avg30dQuoteVolume = tail.length > 0 ? tail.reduce((s, c) => s + c.quoteVolume, 0) / tail.length : null;
  return {
    perf1W: perfAt(7),
    perf1M: perfAt(30),
    perf3M: perfAt(90),
    perf6M: perfAt(180),
    perf1Y: perfAt(365),
    avg30dQuoteVolume,
    refPrice,
  };
}
