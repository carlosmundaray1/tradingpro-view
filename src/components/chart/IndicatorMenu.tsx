"use client";

import { Activity } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";

export function IndicatorMenu() {
  const setAddDialogOpen = useChartStore((s) => s.setAddDialogOpen);
  const count = useChartStore((s) => s.instances.length);

  return (
    <button
      onClick={() => setAddDialogOpen(true)}
      className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text hover:bg-tv-panel-hover"
    >
      <Activity className="h-3.5 w-3.5" />
      <span>Indicadores</span>
      {count > 0 && (
        <span className="ml-1 rounded bg-tv-blue/20 px-1.5 py-0.5 text-[10px] font-semibold text-tv-blue">
          {count}
        </span>
      )}
    </button>
  );
}
