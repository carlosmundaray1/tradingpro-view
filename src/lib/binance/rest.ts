import type { Candle, SymbolInfo, SymbolCategory, Ticker24h, Timeframe } from "./types";

const BASE = "https://api.binance.com/api/v3";

export async function fetchKlines(
  symbol: string,
  interval: Timeframe,
  limit = 1000,
  endTime?: number,
): Promise<Candle[]> {
  let url = `${BASE}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  if (endTime !== undefined && isFinite(endTime) && endTime > 0) {
    url += `&endTime=${endTime}`;
  }
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`klines ${res.status}`);
  const data = (await res.json()) as unknown[][];
  return data.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
    isFinal: true,
  }));
}

/** Klines con quoteVolume (índice 7 de la respuesta cruda de Binance /klines).
 *  Lo usamos para cálculos de volumen medio 30d en USD: el `volume` base está
 *  en unidades del asset base (BTC, ETH), no comparable entre activos. */
export interface KlineWithQuote {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
}

export async function fetchKlinesWithQuote(
  symbol: string,
  interval: Timeframe,
  limit = 500,
): Promise<KlineWithQuote[]> {
  const url = `${BASE}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`klines ${res.status}`);
  const data = (await res.json()) as unknown[][];
  return data.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
    quoteVolume: parseFloat(k[7] as string),
  }));
}

export async function fetchTicker24h(symbol: string): Promise<Ticker24h> {
  const url = `${BASE}/ticker/24hr?symbol=${symbol.toUpperCase()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ticker ${res.status}`);
  const t = await res.json();
  return {
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  };
}

export async function fetchTickers24h(symbols: string[]): Promise<Ticker24h[]> {
  const arr = JSON.stringify(symbols.map((s) => s.toUpperCase()));
  const url = `${BASE}/ticker/24hr?symbols=${encodeURIComponent(arr)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`tickers ${res.status}`);
  const data = await res.json();
  return data.map((t: Record<string, string>) => ({
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  }));
}

let cachedSymbols: SymbolInfo[] | null = null;

// Suscriptores que quieren saber cuando `cachedSymbols` se llena. Permite que
// los componentes (useChart, PriceChart) reaccionen al preload de exchangeInfo
// sin tener que ellos mismos disparar el fetch. Cuando el cache está vacío,
// getSymbolPrecision devuelve 2 como fallback; al completarse el preload,
// disparamos estos listeners para que los consumidores re-lean la precisión
// real del símbolo y actualicen el priceFormat / labels.
type CacheListener = () => void;
const cacheListeners = new Set<CacheListener>();
function notifyCacheReady(): void {
  for (const l of cacheListeners) {
    try {
      l();
    } catch {}
  }
}

/** Cuenta los decimales del `tickSize` string (formato Binance: "0.0001").
 *  Devuelve 0 si el tickSize es entero (ej: "1"). Robusto: NO usa parseFloat
 *  para evitar pérdida de precisión en ticks muy pequeños (ej: 1e-8). */
function decimalsFromTickSize(tick: string): number {
  if (!tick) return 2;
  const s = tick.trim();
  if (s.includes("e") || s.includes("E")) {
    const m = s.match(/[eE]([+-]?\d+)/);
    if (m) return Math.max(0, parseInt(m[1], 10));
  }
  const dot = s.indexOf(".");
  if (dot < 0) return 0;
  const trimmed = s.replace(/0+$/, "");
  const lastNonZero = trimmed.length - 1;
  return Math.max(0, lastNonZero - dot);
}

export async function fetchExchangeSymbols(): Promise<SymbolInfo[]> {
  if (cachedSymbols) return cachedSymbols;
  const res = await fetch(`${BASE}/exchangeInfo`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`exchangeInfo ${res.status}`);
  const data = await res.json();
  cachedSymbols = data.symbols
    .filter((s: { status: string }) => s.status === "TRADING")
    .map((s: { symbol: string; baseAsset: string; quoteAsset: string; status: string; filters?: Array<{ filterType: string; tickSize?: string }> }) => {
      const priceFilter = s.filters?.find((f) => f.filterType === "PRICE_FILTER");
      const tickSize = priceFilter?.tickSize;
      return {
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        status: s.status,
        tickSize,
        pricePrecision: tickSize ? decimalsFromTickSize(tickSize) : undefined,
        category: categorizeSymbol(s.baseAsset, s.quoteAsset),
      } satisfies SymbolInfo;
    });
  // Notificar a los subscriptores que el cache ya está disponible, para que
  // puedan re-leer la precisión real del símbolo (el preload inicial termina
  // unos ms después del primer render del chart).
  notifyCacheReady();
  return cachedSymbols!;
}

/**
 * Clasifica un par de Binance spot en una de las categorías canónicas
 * (`Cripto`, `Forex`, `Commodities`, `Índices`, `Otros`) según su
 * `quoteAsset` y `baseAsset`. Heurística calibrada con el catálogo REAL de
 * Binance spot (consultado en 2026-07):
 *
 *   - Commodities: oro/mercancías tokenizadas (XAUT = Tether Gold, PAXG =
 *     Pax Gold). Binance spot no tiene plata/platino/paladio (XAG/XPT/XPD
 *     son sólo en futures).
 *   - Forex: cripto contra divisas fiat puras (TRY, EUR, JPY, AUD, etc.).
 *     NOTA: Binance NO es broker forex, no tiene EURUSDT/GBPUSDT en spot.
 *     Lo que ofrece son BTC contra TRY/EUR/BRL — todos cuentan como Forex
 *     (precio del cripto en la moneda local).
 *   - Índices: Binance Index Tokens (BTCST Satoshi, BTCDOM, 1000*).
 *   - Cripto: el resto (todo lo que quotea en USDT/USDC/FDUSD/BUSD/DAI/
 *     USDP/TUSD/stables, o pares cripto-cripto como ETHBTC).
 *   - Otros: si no calza en lo anterior (fulbo-fichas, EUR stablecoins).
 */
function categorizeSymbol(baseAsset: string, quoteAsset: string): SymbolCategory {
  const base = baseAsset.toUpperCase();
  const quote = quoteAsset.toUpperCase();
  // Commodities: oro tokenizado (Tether Gold XAUT, Pax Gold PAXG).
  if (base === "XAUT" || base === "PAXG") {
    return "Commodities";
  }
  // Índices: Binance Index Tokens y "1000*" wrappers (1000SHIB, 1000XEC, etc).
  if (
    base === "BTCST" ||
    base === "BTCDOM" ||
    base.startsWith("DEFI") ||
    base.startsWith("INDEX") ||
    base.startsWith("1000")
  ) {
    return "Índices";
  }
  // Forex: cripto contra fiat (TRY, EUR, JPY, AUD, CAD, CHF, NZD, BRL, ARS,
  // ZAR, MXN, IDRT, BVND, RUB, UAH, PLN, RON, BIDR). Esto incluye pares como
  // BTCTRY, ETHJPY, BTCEUR. NO incluye EURUSDT/GBPUSDT que no existen en spot.
  const forexQuotes = new Set([
    "TRY", "EUR", "JPY", "AUD", "CAD", "CHF", "NZD",
    "BRL", "ARS", "ZAR", "MXN", "IDRT", "BVND",
    "RUB", "UAH", "PLN", "RON", "BIDR", "IDR",
    "GBP",
  ]);
  if (forexQuotes.has(quote)) {
    return "Forex";
  }
  // Stablecoins y pares cripto-cripto → Cripto.
  const stableQuotes = new Set([
    "USDT", "USDC", "FDUSD", "TUSD", "BUSD", "DAI",
    "USDP", "USTC", "USD", "EURI", "AEUR", "USD1", "U",
  ]);
  if (stableQuotes.has(quote)) {
    return "Cripto";
  }
  const cryptoQuotes = new Set(["BTC", "ETH", "BNB", "TRX", "XMR"]);
  if (cryptoQuotes.has(quote)) {
    return "Cripto";
  }
  return "Otros";
}

/** Devuelve la precisión (cantidad de decimales) del precio para un símbolo
 *  dado (ej: XRPUSDT => 4, DOGEUSDT => 5, BTCUSDT => 2). Usa el cache de
 *  fetchExchangeSymbols. Si el símbolo no se conoce o el cache aún no está
 *  cargado, devuelve 2 como fallback razonable (mayoría de los USDT).
 *  Es sync: si todavía no hay cache, retorna el fallback. Para forzar la
 *  carga inicial, llamá a `fetchExchangeSymbols()` en el init de la app. */
export function getSymbolPrecision(symbol: string): number {
  if (!cachedSymbols) return 2;
  const sym = cachedSymbols.find((s) => s.symbol === symbol.toUpperCase());
  if (!sym) return 2;
  if (typeof sym.pricePrecision === "number" && sym.pricePrecision >= 0) {
    return sym.pricePrecision;
  }
  if (sym.tickSize) {
    const p = decimalsFromTickSize(sym.tickSize);
    sym.pricePrecision = p;
    return p;
  }
  return 2;
}

/** Devuelve el `minMove` (paso mínimo del precio) como número para el símbolo.
 *  Equivale a `tickSize` parseado, con fallback 0.01. */
export function getSymbolMinMove(symbol: string): number {
  if (!cachedSymbols) return 0.01;
  const sym = cachedSymbols.find((s) => s.symbol === symbol.toUpperCase());
  if (!sym) return 0.01;
  if (sym.tickSize) {
    const v = parseFloat(sym.tickSize);
    if (isFinite(v) && v > 0) return v;
  }
  const p = getSymbolPrecision(symbol);
  return p > 0 ? 1 / Math.pow(10, p) : 1;
}

/** Suscribe un listener que se dispara cuando `cachedSymbols` se completa.
 *  Útil para que los componentes re-lean el pricePrecision cuando el preload
 *  inicial de exchangeInfo finaliza. Retorna una función de desubscripción. */
export function subscribeSymbolsCacheReady(listener: CacheListener): () => void {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

/** Devuelve true si el cache de símbolos ya está cargado (útil para evitar
 *  renderizar labels con precision fallback 2 cuando pronto tendrá real). */
export function areSymbolsCached(): boolean {
  return cachedSymbols !== null;
}
