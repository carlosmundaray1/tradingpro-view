"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchExchangeSymbols } from "@/lib/binance/rest";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";
import type { SymbolInfo, SymbolCategory } from "@/lib/binance/types";
import {
  baseOf,
  quoteOf,
  logoUrl,
  displayName,
  marketTag,
  marketTagColor,
  isPerpetual,
  toPerpetual,
} from "@/lib/binance/symbol-meta";

/** Orden visual de las categorías en el diálogo. */
const CATEGORY_ORDER: SymbolCategory[] = [
  "Cripto",
  "Forex",
  "Commodities",
  "Índices",
  "Otros",
];

interface CategoryGroup {
  category: SymbolCategory;
  items: SymbolInfo[];
}

/** Iniciales en uppercase del símbolo para usarlas como fallback en el
 *  logo cuando cryptocurrency-icons no tiene el asset (404). */
function initials(s: string): string {
  return baseOf(s).slice(0, 3).toUpperCase();
}

export function SymbolSelector() {
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);

  const [query, setQuery] = useState("");
  const [allSymbols, setAllSymbols] = useState<SymbolInfo[]>([]);
  const [activeCategory, setActiveCategory] = useState<SymbolCategory | "Todas">("Todas");
  // Toggle: incluir perpetuals (.P) en el listado. TV Pro los lista aparte
  // bajo "Futuros" — acá los marcamos con badge PERP y se filtran junto al spot.
  const [includeFutures, setIncludeFutures] = useState(true);

  useEffect(() => {
    if (open && allSymbols.length === 0) {
      fetchExchangeSymbols().then(setAllSymbols).catch(console.error);
    }
  }, [open, allSymbols.length]);

  // Construir listado final: spot + perpetual (.P) si activo.
  const allWithFutures = useMemo<SymbolInfo[]>(() => {
    if (!includeFutures) return allSymbols;
    return [
      ...allSymbols,
      ...allSymbols.map((s) => ({
        ...s,
        symbol: toPerpetual(s.symbol),
      })),
    ];
  }, [allSymbols, includeFutures]);

  // Filtrado por query y/o categoría activa.
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    let list = allWithFutures;
    if (activeCategory !== "Todas") {
      list = list.filter((s) => s.category === activeCategory);
    }
    if (q) {
      list = list.filter(
        (s) =>
          s.symbol.includes(q) ||
          s.baseAsset.includes(q) ||
          s.quoteAsset.includes(q) ||
          displayName(s.symbol).toUpperCase().includes(q),
      );
    }
    return list.slice(0, 500);
  }, [query, allWithFutures, activeCategory]);

  // Agrupar resultados por categoría (en orden canónico) para renderizar.
  const groups = useMemo<CategoryGroup[]>(() => {
    const buckets = new Map<SymbolCategory, SymbolInfo[]>();
    for (const cat of CATEGORY_ORDER) buckets.set(cat, []);
    for (const s of filtered) {
      const cat = s.category ?? "Otros";
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat)!.push(s);
    }
    return CATEGORY_ORDER.map((c) => ({ category: c, items: buckets.get(c) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [filtered]);

  // Conteos por categoría (para mostrar en los chips de filtro).
  const counts = useMemo(() => {
    const c: Record<string, number> = { Todas: allWithFutures.length };
    for (const s of allWithFutures) {
      const k = s.category ?? "Otros";
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [allWithFutures]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="group flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold hover:bg-tv-panel-hover">
        <Search className="h-3.5 w-3.5 text-tv-text-muted group-hover:text-tv-text" />
        <span className="tabular-nums">{symbol}</span>
        <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
      </DialogTrigger>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">Buscar símbolo</DialogTitle>
        </DialogHeader>
        <div className="border-b border-tv-border p-3">
          <Input
            autoFocus
            placeholder="BTC, Ethereum, Gold, EUR…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-tv-bg"
          />
        </div>
        {/* Fila: chips de categoría + toggle Futuros */}
        <div className="flex flex-wrap items-center gap-1 border-b border-tv-border px-3 py-2">
          {(["Todas", ...CATEGORY_ORDER] as const).map((cat) => {
            const count = counts[cat] ?? 0;
            if (count === 0 && cat !== "Todas") return null;
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
                  active
                    ? "bg-tv-text text-tv-bg"
                    : "bg-tv-panel-hover text-tv-text-muted hover:text-tv-text",
                )}
              >
                {cat}
                <span className="ml-1 opacity-60 tabular-nums">{count}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setIncludeFutures((v) => !v)}
            title="Incluir futuros perpetual (.P)"
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
              includeFutures
                ? "bg-amber-500/20 text-amber-400"
                : "bg-tv-panel-hover text-tv-text-muted hover:text-tv-text",
            )}
          >
            Futuros {includeFutures ? "✓" : ""}
          </button>
        </div>
        <ScrollArea className="h-[400px]">
          <div className="flex flex-col">
            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                Sin resultados
              </div>
            )}
            {groups.map((group) => (
              <div key={group.category}>
                <div className="sticky top-0 z-10 bg-tv-panel/95 px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-tv-text-dim backdrop-blur">
                  {group.category} · {group.items.length}
                </div>
                {group.items.map((s) => {
                  const isPerp = isPerpetual(s.symbol);
                  const tag = marketTag(s.symbol, s.category);
                  const url = logoUrl(s.symbol);
                  const name = displayName(s.symbol);
                  return (
                    <button
                      key={s.symbol}
                      onClick={() => {
                        setSymbol(s.symbol);
                        addToWatchlist(s.symbol);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex items-center gap-3 border-b border-tv-border/60 px-3 py-2 text-left text-xs transition-colors hover:bg-tv-panel-hover",
                        s.symbol === symbol && "bg-tv-panel-hover",
                      )}
                    >
                      {/* Logo 28x28 */}
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tv-bg ring-1 ring-tv-border">
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={s.baseAsset}
                            loading="lazy"
                            className="h-6 w-6"
                            onError={(e) => {
                              const t = e.currentTarget;
                              t.style.display = "none";
                              const parent = t.parentElement;
                              if (parent) {
                                parent.textContent = initials(s.symbol);
                                parent.style.fontSize = "10px";
                                parent.style.fontWeight = "700";
                                parent.style.color = "var(--color-tv-text-muted, #787b86)";
                              }
                            }}
                          />
                        ) : (
                          <span className="text-[10px] font-bold text-tv-text-muted">
                            {initials(s.symbol)}
                          </span>
                        )}
                      </span>
                      {/* Nombre + ticker */}
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-semibold text-tv-text">
                          {name}
                        </span>
                        <span className="truncate text-[10px] text-tv-text-muted tabular-nums">
                          {s.baseAsset}
                          <span className="text-tv-text-dim">/</span>
                          {s.quoteAsset}
                          {isPerp && <span className="ml-1 text-amber-400">.P</span>}
                        </span>
                      </div>
                      {/* Badge mercado */}
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                          marketTagColor(tag),
                        )}
                      >
                        {tag}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
