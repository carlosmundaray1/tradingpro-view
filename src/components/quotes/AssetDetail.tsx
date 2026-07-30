"use client";

import { useMemo } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import { useQuotes, type Quote } from "@/lib/hooks/useQuotes";
import { useAssetStats } from "@/lib/hooks/useAssetStats";
import { getSymbolPrecision } from "@/lib/binance/rest";
import { formatPrice, formatPct, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const LOGO_BASE = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color";

function baseOf(symbol: string): string {
  const quotes = ["USDT", "BUSD", "USDC", "TUSD", "FDUSD", "EUR", "TRY", "BTC", "ETH", "BNB", "XRP", "DOGE", "SOL"];
  for (const q of quotes) {
    if (symbol.endsWith(q)) return symbol.slice(0, symbol.length - q.length).toLowerCase();
  }
  return symbol.toLowerCase();
}
function logoUrl(symbol: string): string {
  return `${LOGO_BASE}/${baseOf(symbol)}.png`;
}

interface Props {
  /** Símbolo a mostrar en el detalle. */
  symbol: string;
}

/**
 * Bloque de detalle del activo seleccionado. Se muestra debajo de la lista
 * de quotes, dentro del panel inferior derecho (estilo TradingView Pro):
 *
 *   ┌─────────────────────────────┐
 *   │ [logo]  BTC                 │
 *   │         Bitcoin             │
 *   │                            │
 *   │ $63,250.40                  │  ← precio grande
 *   │ +120.50  +0.19%             │  ← cambio 24h
 *   │                            │
 *   │ Volumen 24h    $12.5B       │
 *   │ Volumen 30d    $9.8B (avg)  │
 *   │                            │
 *   │ Rendimiento                 │
 *   │  ┌─────┬───────┬───────┐   │
 *   │  │ 1W  │ +1.2% │ verde │   │
 *   │  │ 1M  │ -2.5% │ rojo  │   │
 *   │  │ 3M  │ ...   │       │   │
 *   │  │ 6M  │       │       │   │
 *   │  │ 1Y  │       │       │   │
 *   │  └─────┴───────┴───────┘   │
 *   └─────────────────────────────┘
 *
 * Datos:
 *  - precio y 24h vía `useQuotes` (WS miniTicker).
 *  - volumen 24h, volumen medio 30d y rendimientos 1W/1M/3M/6M/1Y vía
 *    `useAssetStats` (un /klines 1d, cache TTL 5min).
 */
export function AssetDetail({ symbol }: Props) {
  // Lee el snapshot del quote para este símbolo.
  // Si no está en la watchlist, lo subscribimos aparte para seguir
  // recibiendo updates WS del símbolo activo (sin esto, el precio
  // grande se congelaría cuando el usuario abre un activo que no está
  // en su watchlist).
  const watchlist = useChartStore((s) => s.watchlist);
  // Me subscribo a watchlist + symbol activo (dedupe) para tener
  // ambas fuentes en un único estado. Esto mantiene el precio grande
  // siempre fresco, incluso si el símbolo no está en la watchlist.
  //
  // IMPORTANTE: el array resultante se estabiliza con useMemo — si lo
  // armamos inline en cada render, cada tick de precio genera un nuevo
  // array (nueva referencia) y el hook useQuotes vuelve a suscribirse
  // al WS, perdiendo actualizaciones (síntoma: el precio se congela
  // aunque el chart principal siga moviéndose).
  const symbols = useMemo(
    () => Array.from(new Set([...watchlist, symbol])),
    [watchlist.join("|"), symbol],
  );
  const quotes = useQuotes(symbols);
  const stats = useAssetStats(symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);

  // El precio actual (tick) puede venir de quotes[symbol] si está en la
  // watchlist; si no, fallback al refPrice del snapshot diario de stats.
  const q: Quote | undefined = quotes[symbol];
  const precision = getSymbolPrecision(symbol);
  const base = baseOf(symbol).toUpperCase();
  // Nombre amigable del activo (mapeo hard-codeado de los comunes, fallback = base).
  const name = prettyName(base);

  const price = q ? q.price : stats.refPrice;
  const changeAbs = q ? q.change : null;
  const changePct = q ? q.pct : null;
  const vol24h = q ? q.quoteVolume : null;
  const up24h = changePct == null ? null : changePct >= 0;

  // Filas: [label, value, isUp]
  const rows: { label: string; value: string; up: boolean | null }[] = [
    { label: "Volumen 24h", value: vol24h != null ? `$${formatVolume(vol24h)}` : "—", up: null },
    { label: "Volumen 30d (avg)", value: stats.avg30dQuoteVolume != null ? `$${formatVolume(stats.avg30dQuoteVolume)}` : "—", up: null },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-tv-panel">
      <div className="flex shrink-0 items-center justify-between border-b border-tv-border px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Detalle
        </h2>
        <button
          type="button"
          onClick={() => setSymbol(symbol)}
          title="Cargar en el chart"
          className="rounded px-1.5 py-0.5 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          Abrir →
        </button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-center gap-3">
            {/* Logo grande 56x56 */}
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tv-bg ring-1 ring-tv-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl(symbol)}
                alt={base}
                loading="lazy"
                className="h-12 w-12"
                onError={(e) => {
                  const t = e.currentTarget;
                  t.style.display = "none";
                  const parent = t.parentElement;
                  if (parent) {
                    parent.textContent = base.slice(0, 3).toUpperCase();
                    parent.style.fontSize = "16px";
                    parent.style.fontWeight = "700";
                    parent.style.color = "var(--color-tv-text-muted, #787b86)";
                  }
                }}
              />
            </span>
            {/* Nombre */}
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-bold uppercase tracking-tight text-tv-text">
                {base}
              </div>
              <div className="truncate text-[11px] text-tv-text-muted">
                {name}
              </div>
            </div>
          </div>

          {/* Precio grande */}
          <div className="flex flex-col gap-0.5">
            <div
              className={cn(
                "text-3xl font-bold tabular-nums leading-none",
                up24h === null ? "text-tv-text" : up24h ? "text-tv-green" : "text-tv-red",
              )}
            >
              {price != null ? `$${formatPrice(price, precision)}` : "—"}
            </div>
            <div className="flex items-baseline gap-2 text-sm tabular-nums">
              <span className={up24h === null ? "text-tv-text-muted" : up24h ? "text-tv-green" : "text-tv-red"}>
                {changeAbs != null ? `${up24h ? "+" : ""}${formatPrice(changeAbs, precision)}` : "—"}
              </span>
              <span className={up24h === null ? "text-tv-text-muted" : up24h ? "text-tv-green" : "text-tv-red"}>
                {changePct != null ? formatPct(changePct) : "—"}
              </span>
              <span className="text-[10px] text-tv-text-muted">24h</span>
            </div>
          </div>

          {/* Volumen 24h + Vol 30d */}
          <div className="flex flex-col gap-1.5 rounded-md border border-tv-border/40 bg-tv-bg/40 px-3 py-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-xs">
                <span className="text-tv-text-muted">{r.label}</span>
                <span className="font-medium tabular-nums text-tv-text">{r.value}</span>
              </div>
            ))}
          </div>

          {/* Rendimientos 1W / 1M / 3M / 6M / 1Y — grid 2 columnas */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
              Rendimiento
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <PerfTile label="1W" value={stats.perf1W} />
              <PerfTile label="1M" value={stats.perf1M} />
              <PerfTile label="3M" value={stats.perf3M} />
              <PerfTile label="6M" value={stats.perf6M} />
              <PerfTile label="1Y" value={stats.perf1Y} />
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

/** Tile individual de rendimiento: label arriba, % grande abajo, color verde/rojo. */
function PerfTile({ label, value }: { label: string; value: number | null }) {
  const up = value == null ? null : value >= 0;
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-tv-border/40 bg-tv-bg/40 px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          up === null ? "text-tv-text-muted" : up ? "text-tv-green" : "text-tv-red",
        )}
      >
        {value == null ? "—" : formatPct(value)}
      </span>
    </div>
  );
}

const NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  BNB: "BNB",
  SOL: "Solana",
  XRP: "XRP",
  ADA: "Cardano",
  DOGE: "Dogecoin",
  AVAX: "Avalanche",
  LINK: "Chainlink",
  DOT: "Polkadot",
  MATIC: "Polygon",
  LTC: "Litecoin",
  TRX: "TRON",
  SHIB: "Shiba Inu",
  UNI: "Uniswap",
  ATOM: "Cosmos",
  XLM: "Stellar",
  NEAR: "NEAR Protocol",
  APT: "Aptos",
  FIL: "Filecoin",
  ARB: "Arbitrum",
  OP: "Optimism",
  INJ: "Injective",
  SUI: "Sui",
  SEI: "Sei",
  TIA: "Celestia",
  RUNE: "THORChain",
  AAVE: "Aave",
  MKR: "Maker",
  GRT: "The Graph",
  SAND: "The Sandbox",
  MANA: "Decentraland",
  AXS: "Axie Infinity",
  FTM: "Fantom",
  ALGO: "Algorand",
  EGLD: "MultiversX",
  FLOW: "Flow",
  THETA: "Theta Network",
  CHZ: "Chiliz",
  ENJ: "Enjin Coin",
  GALA: "Gala",
  USDC: "USD Coin",
  USDT: "Tether",
  BUSD: "Binance USD",
};

function prettyName(base: string): string {
  return NAMES[base] ?? base;
}
