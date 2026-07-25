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

export function SymbolSelector() {
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);

  const [query, setQuery] = useState("");
  const [allSymbols, setAllSymbols] = useState<SymbolInfo[]>([]);
  const [activeCategory, setActiveCategory] = useState<SymbolCategory | "Todas">("Todas");

  useEffect(() => {
    if (open && allSymbols.length === 0) {
      fetchExchangeSymbols().then(setAllSymbols).catch(console.error);
    }
  }, [open, allSymbols.length]);

  // Filtrado por query y/o categoría activa.
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    let list = allSymbols;
    if (activeCategory !== "Todas") {
      list = list.filter((s) => s.category === activeCategory);
    }
    if (q) {
      list = list.filter(
        (s) =>
          s.symbol.includes(q) ||
          s.baseAsset.includes(q) ||
          s.quoteAsset.includes(q),
      );
    }
    return list.slice(0, 500);
  }, [query, allSymbols, activeCategory]);

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
    const c: Record<string, number> = { Todas: allSymbols.length };
    for (const s of allSymbols) {
      const k = s.category ?? "Otros";
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [allSymbols]);

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
            placeholder="BTC, ETH, SOL, XAU, EUR…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-tv-bg"
          />
        </div>
        {/* Chips de filtro por categoría */}
        <div className="flex flex-wrap gap-1 border-b border-tv-border px-3 py-2">
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
                {group.items.map((s) => (
                  <button
                    key={s.symbol}
                    onClick={() => {
                      setSymbol(s.symbol);
                      addToWatchlist(s.symbol);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex items-center justify-between border-b border-tv-border px-4 py-2 text-left text-xs hover:bg-tv-panel-hover",
                      s.symbol === symbol && "bg-tv-panel-hover",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-tv-text">{s.baseAsset}</span>
                      <span className="text-tv-text-muted">/ {s.quoteAsset}</span>
                    </div>
                    <span className="text-tv-text-muted">{s.symbol}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
