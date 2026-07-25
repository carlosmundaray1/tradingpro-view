"use client";

import { useEffect, useState } from "react";
import { fetchTickers24h } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";

export interface Quote {
  symbol: string;
  price: number;
  /** Cambio % en 24h (negativo = baja). */
  pct: number;
  /** Cambio absoluto del precio en 24h (signed, ej: +120.50 / -0.0023). */
  change: number;
  /** Precio máximo 24h. */
  high: number;
  /** Precio mínimo 24h. */
  low: number;
  /** Volumen base 24h. */
  volume: number;
  /** Volumen quote (USDT) 24h. */
  quoteVolume: number;
}

/**
 * Hook reactivo que devuelve un mapa `Record<symbol, Quote>` de los símbolos
 * pasados. Lo consume tanto `Watchlist` como `QuotesPanel` — ambos paneles
 * comparten el MISMO estado (un único módulo singleton de quotes abajo).
 *
 * Datos:
 *  - snapshot inicial vía `fetchTickers24h` (Binance batch /ticker/24hr).
 *  - updates en tiempo real vía `subscribeMiniTickers` (WS miniTicker).
 *  - delta de precio y % calculado contra el `open` 24h que viene en el WS.
 *
 * Polling: NO necesita. miniTicker dispara cada vez que cambia el close →
 * cubre P/L en tiempo real. El snapshot inicial sólo trae high/low/volume
 * (que no varían segundo a segundo salvo re-basar).
 */
export function useQuotes(symbols: string[]): Record<string, Quote> {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => {
    if (symbols.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuotes({});
      return;
    }
    let cancelled = false;

    // 1) Snapshot inicial (batch /ticker/24hr)
    fetchTickers24h(symbols)
      .then((tickers) => {
        if (cancelled) return;
        const map: Record<string, Quote> = {};
        tickers.forEach((t) => {
          map[t.symbol] = {
            symbol: t.symbol,
            price: t.lastPrice,
            change: t.priceChange,
            pct: t.priceChangePercent,
            high: t.highPrice,
            low: t.lowPrice,
            volume: t.volume,
            quoteVolume: t.quoteVolume,
          };
        });
        setQuotes((prev) => ({ ...map, ...prev }));
      })
      .catch((e) => console.error("useQuotes initial fetch:", e));

    // 2) Updates en tiempo real: miniTicker con c (close), o (open), h, l, v
    const ws = getBinanceWS();
    const unsub = ws.subscribeMiniTickers(symbols, (tick) => {
      setQuotes((prev) => {
        const prevQuote = prev[tick.symbol];
        // Mantener high/low/volume del snapshot si no están en el WS tick.
        const high = prevQuote?.high;
        const low = prevQuote?.low;
        const volume = prevQuote?.volume;
        const quoteVolume = prevQuote?.quoteVolume;
        const change = tick.open === 0 ? 0 : tick.close - tick.open;
        return {
          ...prev,
          [tick.symbol]: {
            symbol: tick.symbol,
            price: tick.close,
            pct: tick.pct,
            change,
            high,
            low,
            volume,
            quoteVolume,
          },
        };
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [symbols.join(",")]);

  return quotes;
}
