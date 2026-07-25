"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { PriceChart } from "@/components/chart/PriceChart";
import { IndicatorSettingsDialog } from "@/components/chart/IndicatorSettingsDialog";
import { AddIndicatorDialog } from "@/components/chart/AddIndicatorDialog";
import { useChartStore } from "@/lib/store/chart-store";
import { fetchExchangeSymbols } from "@/lib/binance/rest";
import { PanelRight } from "lucide-react";

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

  // En móvil (<md) el RightSidebar se abre como drawer sobre el chart.
  // Toggle desde el botón flotante. En desktop (>=md) está siempre visible.
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      <Header />
      <div className="flex min-h-0 flex-1">
        {/* Sidebar izquierdo (herramientas de dibujo) — sólo desktop.
            En móvil lo ocultamos: el chart precisa todo el ancho. */}
        <div className="hidden md:flex">
          <LeftSidebar />
        </div>
        <main className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <PriceChart symbol={symbol} timeframe={timeframe} />
          </div>
        </main>
        {/* RightSidebar — desktop: columna fija a la derecha.
            Móvil: drawer overlay sobre el chart, toggleable con FAB. */}
        <div className="hidden md:flex">
          <RightSidebar />
        </div>
        {/* Drawer móvil — slide-in desde la derecha, ancho casi completo. */}
        {mobilePanelOpen && (
          <>
            {/* Backdrop tap-to-close */}
            <button
              type="button"
              aria-label="Cerrar panel"
              onClick={() => setMobilePanelOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
            />
            <div className="fixed right-0 top-0 bottom-0 z-50 flex w-[88vw] max-w-[360px] flex-col border-l border-tv-border bg-tv-panel shadow-2xl md:hidden">
              <div className="flex items-center justify-between border-b border-tv-border px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
                  Panel
                </span>
                <button
                  type="button"
                  onClick={() => setMobilePanelOpen(false)}
                  className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <RightSidebar />
              </div>
            </div>
          </>
        )}
        {/* FAB para abrir el panel en móvil — esquina inferior derecha,
            sobre el chart. No aparece en desktop. */}
        <button
          type="button"
          onClick={() => setMobilePanelOpen(true)}
          className="fixed bottom-12 right-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-tv-blue text-white shadow-lg active:scale-95 md:hidden"
          aria-label="Abrir panel"
          title="Abrir panel"
        >
          <PanelRight className="h-5 w-5" />
        </button>
      </div>
      {/* BottomPanel — visible en desktop y móvil. En móvil puede ser un
          poco más compacto pero su altura de 36px ya es aceptable. */}
      <BottomPanel />
      <IndicatorSettingsDialog />
      <AddIndicatorDialog />
    </div>
  );
}
