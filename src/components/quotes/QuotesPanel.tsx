"use client";

import { useChartStore } from "@/lib/store/chart-store";
import { useQuotes } from "@/lib/hooks/useQuotes";
import { getSymbolPrecision } from "@/lib/binance/rest";
import { formatPrice, formatPct, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Quotes panel grande estilo TV Pro.
 *
 * - Lista de activos de la watchlist con Fila grande por activo.
 * - Cada fila: logo + base symbol + precio grande + cambio abs + cambio %.
 * - Click en una fila → carga el símbolo en el chart principal.
 * - Precio / cambios se actualizan en tiempo real vía miniTicker (mismo
 *   `useQuotes` que usa el Watchlist — compartido, sin doble suscripción).
 */

const LOGO_BASE = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color";

/** Convierte "BTCUSDT" -> "btc". */
function baseOf(symbol: string): string {
  // Quitar los quote comunes al final: USDT, BUSD, USDC, TUSD, FDUSD, BTC, ETH, BNB.
  const quotes = ["USDT", "BUSD", "USDC", "TUSD", "FDUSD", "EUR", "TRY", "BTC", "ETH", "BNB", "XRP", "DOGE", "SOL"];
  for (const q of quotes) {
    if (symbol.endsWith(q)) {
      return symbol.slice(0, symbol.length - q.length).toLowerCase();
    }
  }
  return symbol.toLowerCase();
}

/** URL del logo del activo; fallback a `null` si el browser falla el fetch
 *  (404 de un asset no listado en cryptocurrency-icons). */
function logoUrl(symbol: string): string {
  return `${LOGO_BASE}/${baseOf(symbol)}.png`;
}

export function QuotesPanel() {
  const watchlist = useChartStore((s) => s.watchlist);
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const quotes = useQuotes(watchlist);

  return (
    <div className="flex h-full min-h-0 flex-col bg-tv-panel">
      <div className="flex shrink-0 items-center justify-between border-b border-tv-border px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Quotes
        </h2>
        <span className="text-[10px] text-tv-text-dim">24h · Binance</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col">
          {watchlist.map((s) => {
            const q = quotes[s];
            const isActive = s === symbol;
            const up = q ? q.pct >= 0 : true;
            const color = up ? "text-tv-green" : "text-tv-red";
            const precision = getSymbolPrecision(s);
            const base = baseOf(s).toUpperCase();
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSymbol(s)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-tv-border/40 px-3 py-3 text-left transition-colors",
                  "hover:bg-tv-panel-hover",
                  isActive && "bg-tv-panel-hover ring-1 ring-inset ring-tv-blue/30",
                )}
              >
                {/* Logo */}
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tv-bg ring-1 ring-tv-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl(s)}
                    alt={base}
                    loading="lazy"
                    className="h-8 w-8"
                    onError={(e) => {
                      // Fallback: ocultar la imagen rota y mostrar la inicial.
                      const t = e.currentTarget;
                      t.style.display = "none";
                      const parent = t.parentElement;
                      if (parent) {
                        parent.textContent = base.slice(0, 3).toUpperCase();
                        parent.style.fontSize = "11px";
                        parent.style.fontWeight = "600";
                        parent.style.color = "var(--tv-text-muted, #787b86)";
                      }
                    }}
                  />
                </span>
                {/* Símbolo + volumen */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-tv-text">
                    {base}
                  </span>
                  <span className="text-[10px] text-tv-text-dim">
                    {q ? `Vol ${formatVolume(q.quoteVolume)}` : "—"}
                  </span>
                </div>
                {/* Precio + cambios */}
                <div className="flex flex-col items-end gap-0.5">
                  <span
                    className={cn(
                      "text-base font-semibold tabular-nums transition-colors",
                      q ? color : "text-tv-text",
                    )}
                  >
                    {q ? formatPrice(q.price, precision) : "—"}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] tabular-nums">
                    <span className={q ? color : "text-tv-text-muted"}>
                      {q ? `${up ? "+" : ""}${formatPrice(q.change, precision)}` : "—"}
                    </span>
                    <span className={cn(q ? color : "text-tv-text-muted", "font-medium")}>
                      {q ? formatPct(q.pct) : "—"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
          {watchlist.length === 0 && (
            <div className="p-6 text-center text-xs text-tv-text-muted">
              Tu watchlist está vacío.
              <br />
              Agregá símbolos desde la pestaña Watchlist.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
