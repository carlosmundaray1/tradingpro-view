"use client";

import { Code2 } from "lucide-react";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { TimeframeSelector } from "@/components/chart/TimeframeSelector";
import { IndicatorMenu } from "@/components/chart/IndicatorMenu";
import { Separator } from "@/components/ui/separator";

// basePath para GitHub Pages (ej: "/tradingpro-view"). En dev es "" (cadena
// vacía). Se usa para prefijar assets estáticos como el logo (/logo.png ->
// /tradingpro-view/logo.png) y que carguen correctamente en el subpath del repo.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function Header() {
  return (
    <header className="flex h-16 items-end justify-between overflow-visible border-b border-tv-border bg-tv-panel px-3 pb-3 pl-8">
      <div className="flex items-end gap-1">
        <div className="flex items-end pr-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${BASE_PATH}/logo.png`}
            alt="TradingPro View"
            className="h-24 w-auto shrink-0 self-start brightness-0 invert"
            style={{ marginBottom: "-30px" }}
          />
        </div>
        <span className="pb-1 text-sm font-semibold tracking-tight text-tv-text">
          TradingPro <span className="text-tv-text-muted">View</span>
        </span>
        <Separator orientation="vertical" className="ml-2 h-10 bg-tv-border" />
        <SymbolSelector />
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <TimeframeSelector />
        <Separator orientation="vertical" className="mx-1 h-6 bg-tv-border" />
        <IndicatorMenu />
      </div>

      <div className="flex items-center gap-2">
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>Source</span>
        </a>
      </div>
    </header>
  );
}
