export type Timeframe =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d"
  | "3d"
  | "1w"
  | "1M";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal?: boolean; // true when kline closes (WS only)
}

export interface Ticker24h {
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  /** Tamaño mínimo del tick del precio (ej: "0.0001" para XRPUSDT).
   *  Proviene del PRICE_FILTER de Binance exchangeInfo. */
  tickSize?: string;
  /** Cantidad de decimales del precio, derivada de `tickSize`.
   *  Ej: tickSize "0.0001" => 4, "0.01" => 2, "1" => 0. */
  pricePrecision?: number;
  /** Categoría del activo derivada de quoteAsset/baseAsset al clasificar
   *  la lista de pares de Binance según conozcamos los quoteAssets y
   *  patrones de命名. Ej: "Cripto", "Forex", "Commodities", "Índices". */
  category?: SymbolCategory;
}

/** Categorías de pares disponibles en Binance spot. */
export type SymbolCategory =
  | "Cripto"
  | "Forex"
  | "Commodities"
  | "Índices"
  | "Otros";
