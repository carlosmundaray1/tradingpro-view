"use client";

import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { PriceChart } from "@/components/chart/PriceChart";
import { IndicatorSettingsDialog } from "@/components/chart/IndicatorSettingsDialog";
import { AddIndicatorDialog } from "@/components/chart/AddIndicatorDialog";
import { useChartStore } from "@/lib/store/chart-store";
import { fetchExchangeSymbols } from "@/lib/binance/rest";

export default function HomePage() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);

  // Precarga del cache de símbolos de Binance para que getSymbolPrecision
  // (usado por useChart para priceFormat y por PriceChart/IndicatorPill para
  // los labels) disponga del tickSize real de cada símbolo desde el primer
  // render. Si no se hace esto, el cache se llena recién cuando el usuario
  // abre el SymbolSelector, y hasta entonces el precio se muestra con el
  // fallback de 2 decimales (XRP aparecería como "1.11" en vez de "1.1135").
  useEffect(() => {
    fetchExchangeSymbols().catch((e) => console.error("exchangeInfo preload:", e));
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      <Header />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        <main className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <PriceChart symbol={symbol} timeframe={timeframe} />
          </div>
        </main>
        <RightSidebar />
      </div>
      <BottomPanel />
      <IndicatorSettingsDialog />
      <AddIndicatorDialog />
    </div>
  );
}
