"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  useChartStore,
  type IndicatorInstance,
} from "@/lib/store/chart-store";
import { getDescriptor, type ThresholdLine } from "@/lib/indicators/catalog";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";

export function IndicatorSettingsDialog() {
  const targetId = useChartStore((s) => s.settingsTargetId);
  const setTarget = useChartStore((s) => s.setSettingsTargetId);
  const instances = useChartStore((s) => s.instances);
  const updateIndicator = useChartStore((s) => s.updateIndicator);

  const target = targetId ? instances.find((i) => i.id === targetId) ?? null : null;
  const open = target !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setTarget(null);
      }}
    >
      <DialogContent className="max-w-md bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {target ? getDescriptor(target.type).name : ""} — Configuración
          </DialogTitle>
        </DialogHeader>
        {target && (
          <SettingsForm
            key={target.id + JSON.stringify(target.params) + JSON.stringify(target.colors) + JSON.stringify(target.lineWidths) + JSON.stringify(target.lineStyles) + JSON.stringify(target.seriesHidden) + JSON.stringify(target.thresholdLines ?? []) + JSON.stringify(target.overlayPaneIndex)}
            target={target}
            onSave={(patch) => {
              updateIndicator(target.id, patch);
              setTarget(null);
            }}
            onReset={() => {
              const d = getDescriptor(target.type);
              const defaults: Record<string, number | string | boolean> = {};
              for (const p of d.params) defaults[p.key] = p.default;
              const defaultCols: Record<string, string> = {};
              for (const s of d.series) defaultCols[s.key] = s.color;
              const defaultW: Record<string, number> = {};
              const defaultSt: Record<string, "solid" | "dashed" | "dotted"> = {};
              const defaultH: Record<string, boolean> = {};
              for (const s of d.series) {
                defaultW[s.key] = s.defaultWidth ?? (s.shape === "line-thick" ? 2 : 1);
                defaultSt[s.key] = s.defaultStyle ?? "solid";
                defaultH[s.key] = s.defaultHidden ?? false;
              }
              const defaultThresholdLines =
                d.defaultThresholdLines && d.defaultThresholdLines.length > 0
                  ? d.defaultThresholdLines.map((tl) => ({ ...tl }))
                  : undefined;
              updateIndicator(target.id, {
                params: defaults,
                colors: defaultCols,
                lineWidths: defaultW,
                lineStyles: defaultSt,
                seriesHidden: defaultH,
                thresholdLines: defaultThresholdLines,
                overlayPaneIndex: undefined,
              });
              setTarget(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  target: IndicatorInstance;
  onSave: (patch: Partial<IndicatorInstance>) => void;
  onReset: () => void;
}

function SettingsForm({ target, onSave, onReset }: FormProps) {
  const d = getDescriptor(target.type);
  const [params, setParams] = useState<Record<string, number | string | boolean>>(() => ({ ...target.params }));
  const [colors, setColors] = useState<Record<string, string>>(() => ({ ...target.colors }));
  const [lineWidths, setLineWidths] = useState<Record<string, number>>(() => ({ ...target.lineWidths ?? {} }));
  const [lineStyles, setLineStyles] = useState<Record<string, "solid" | "dashed" | "dotted">>(() => ({ ...target.lineStyles ?? {} }));
  const [seriesHidden, setSeriesHidden] = useState<Record<string, boolean>>(() => ({ ...target.seriesHidden ?? {} }));
  const [thresholdLines, setThresholdLines] = useState<ThresholdLine[]>(() =>
    (target.thresholdLines ?? []).map((tl) => ({ ...tl })),
  );
  const [overlayPaneIndex, setOverlayPaneIndex] = useState<number | undefined>(() =>
    target.overlayPaneIndex,
  );

  const isSeparate = d.pane === "separate";

    function save() {
        const cleanParams: Record<string, number | string | boolean> = {};
        for (const p of d.params) {
          if (p.type === "select") {
            cleanParams[p.key] = (params[p.key] as string) ?? String(p.default);
          } else if (p.type === "bool") {
            const cur = params[p.key];
            cleanParams[p.key] =
              typeof cur === "boolean" ? cur : Boolean(p.default);
          } else {
            const v = typeof params[p.key] === "number" ? (params[p.key] as number) : (p.default as number);
            cleanParams[p.key] = clamp(v, p.min ?? -Infinity, p.max ?? Infinity) as number;
          }
        }
        onSave({
          params: cleanParams as Record<string, number | string>,
          colors,
          lineWidths,
          lineStyles,
          seriesHidden,
          thresholdLines: thresholdLines.length > 0 ? thresholdLines : undefined,
          overlayPaneIndex: isSeparate ? overlayPaneIndex : undefined,
        });
      }

  function addThresholdLine() {
    setThresholdLines((prev) => [
      ...prev,
      { value: 0, color: "#787b86", style: "dashed", width: 1, label: "" },
    ]);
  }

  function updateThresholdLine(idx: number, patch: Partial<ThresholdLine>) {
    setThresholdLines((prev) =>
      prev.map((tl, i) => (i === idx ? { ...tl, ...patch } : tl)),
    );
  }

  function removeThresholdLine(idx: number) {
    setThresholdLines((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-3">
      {d.params.length > 0 && (
        <div className={d.params.length > 3 ? "grid grid-cols-3 gap-2" : "flex flex-col gap-2"}>
          {d.params.map((p) =>
            p.type === "select" ? (
              <label key={p.key} className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
                  {p.label}
                </span>
                <select
                  value={(params[p.key] as string) ?? String(p.default)}
                  onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                  className="bg-tv-bg border border-tv-border rounded px-2 py-1 text-sm"
                >
                  {(p.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : p.type === "bool" ? (
              <label
                key={p.key}
                className={cn(
                  "flex items-center gap-2 rounded border border-tv-border bg-tv-bg px-2 py-2",
                  "col-span-full justify-between",
                )}
                style={{ gridColumn: d.params.length > 3 ? "span 1" : undefined }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
                  {p.label}
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(params[p.key] ?? p.default)}
                  onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: e.target.checked }))}
                  className="h-4 w-4 accent-tv-blue"
                />
              </label>
            ) : (
              <label key={p.key} className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
                  {p.label}
                </span>
                <Input
                  type="number"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={
                    typeof params[p.key] === "number"
                      ? (params[p.key] as number)
                      : (p.default as number)
                  }
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    if (!isNaN(n)) setParams((prev) => ({ ...prev, [p.key]: n }));
                  }}
                  className="bg-tv-bg tabular-nums"
                />
              </label>
            ),
          )}
        </div>
      )}

      {d.params.length === 0 && (
        <p className="text-xs text-tv-text-muted">
          Este indicador no tiene parámetros configurables.
        </p>
      )}

      {isSeparate && (
        <>
          <Separator className="my-1 bg-tv-border" />
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={overlayPaneIndex !== undefined}
                onChange={(e) =>
                  setOverlayPaneIndex(e.target.checked ? 1 : undefined)
                }
                className="h-3 w-3 accent-tv-blue"
              />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
                Superponer sobre pane existente
              </span>
            </label>
            {overlayPaneIndex !== undefined && (
              <div className="flex flex-col gap-1 pl-5">
                <span className="text-[10px] text-tv-text-muted">
                  Posición ordinal del indicador separado a superponer (1 = primero).
                </span>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={overlayPaneIndex}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n) && n >= 1) setOverlayPaneIndex(n);
                  }}
                  className="bg-tv-bg tabular-nums w-20"
                />
                <span className="text-[10px] text-tv-text-muted">
                  Ej: si Squeeze es el primer oscilador y ADX es el segundo, dejá
                  ADX con valor 1 para dibujarlo sobre el Squeeze. Cada uno
                  usará su propia escala vertical dentro del mismo pane.
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {d.series.length > 0 && (
        <div className="border-t border-tv-border pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Series
          </div>
          <div className="mt-2 flex flex-col gap-3">
            {d.series.map((s) => {
              const isLine = s.shape === "line" || s.shape === "line-thick" || s.shape === "step" || s.shape === "band" || s.shape === "dots";
              const hidden = seriesHidden[s.key] ?? s.defaultHidden ?? false;
              return (
                <div
                  key={s.key}
                  className={cn(
                    "flex flex-col gap-2 rounded border border-tv-border p-2 transition-opacity",
                    hidden && "opacity-50",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-tv-text">{s.label}</span>
                    <button
                      onClick={() =>
                        setSeriesHidden((prev) => ({ ...prev, [s.key]: !hidden }))
                      }
                      title={hidden ? "Mostrar serie" : "Ocultar serie"}
                      className="rounded p-1 text-tv-text-dim hover:bg-tv-panel-hover hover:text-tv-text"
                    >
                      {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase text-tv-text-muted">Color</span>
                      <div className="flex items-center gap-1">
                        <span
                          className="h-6 w-6 rounded ring-1 ring-tv-border"
                          style={{ background: colors[s.key] ?? s.color }}
                        />
                        <input
                          type="color"
                          value={colors[s.key] ?? s.color}
                          onChange={(e) =>
                            setColors((prev) => ({ ...prev, [s.key]: e.target.value }))
                          }
                          className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                      </div>
                    </label>
                    {isLine && (
                      <>
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase text-tv-text-muted">Grosor</span>
                          <select
                            value={lineWidths[s.key] ?? 1}
                            onChange={(e) =>
                              setLineWidths((prev) => ({ ...prev, [s.key]: parseInt(e.target.value, 10) }))
                            }
                            className="rounded bg-tv-bg px-2 py-1 text-xs"
                          >
                            <option value={1}>1 — fino</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                            <option value={4}>4 — grueso</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase text-tv-text-muted">Estilo</span>
                          <select
                            value={lineStyles[s.key] ?? "solid"}
                            onChange={(e) =>
                              setLineStyles((prev) => ({
                                ...prev,
                                [s.key]: e.target.value as "solid" | "dashed" | "dotted",
                              }))
                            }
                            className="rounded bg-tv-bg px-2 py-1 text-xs"
                          >
                            <option value="solid">Sólida</option>
                            <option value="dashed">Discontinua</option>
                            <option value="dotted">Punteada</option>
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Separator className="my-1 bg-tv-border" />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Líneas de umbral
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={addThresholdLine}
            className="h-6 px-2 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          >
            <Plus className="mr-1 h-3 w-3" />
            Agregar línea
          </Button>
        </div>
        {thresholdLines.length === 0 && (
          <p className="text-[11px] text-tv-text-muted">
            Sin líneas. Útil para marcar el umbral del ADX (23) o el centro
            (0) de osciladores.
          </p>
        )}
        {thresholdLines.length > 0 && (
          <div className="flex flex-col gap-2">
            {thresholdLines.map((tl, idx) => (
              <div
                key={idx}
                className="flex flex-col gap-2 rounded border border-tv-border p-2"
              >
                <div className="flex items-center gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-tv-text-muted">Valor</span>
                    <Input
                      type="number"
                      step="any"
                      value={tl.value}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        if (!isNaN(n)) updateThresholdLine(idx, { value: n });
                      }}
                      className="bg-tv-bg tabular-nums w-20"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-tv-text-muted">Color</span>
                    <div className="flex items-center gap-1">
                      <span
                        className="h-6 w-6 rounded ring-1 ring-tv-border"
                        style={{ background: tl.color }}
                      />
                      <input
                        type="color"
                        value={tl.color}
                        onChange={(e) => updateThresholdLine(idx, { color: e.target.value })}
                        className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                    </div>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-tv-text-muted">Label</span>
                    <Input
                      type="text"
                      value={tl.label ?? ""}
                      onChange={(e) => updateThresholdLine(idx, { label: e.target.value })}
                      className="bg-tv-bg w-24"
                      placeholder="op."
                    />
                  </label>
                  <button
                    onClick={() => removeThresholdLine(idx)}
                    title="Eliminar línea"
                    className="ml-auto mt-4 self-end rounded p-1 text-tv-text-dim hover:bg-tv-panel-hover hover:text-tv-text"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-tv-text-muted">Estilo</span>
                    <select
                      value={tl.style}
                      onChange={(e) =>
                        updateThresholdLine(idx, {
                          style: e.target.value as ThresholdLine["style"],
                        })
                      }
                      className="rounded bg-tv-bg px-2 py-1 text-xs"
                    >
                      <option value="solid">Sólida</option>
                      <option value="dashed">Discontinua</option>
                      <option value="dotted">Punteada</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-tv-text-muted">Grosor</span>
                    <select
                      value={tl.width}
                      onChange={(e) =>
                        updateThresholdLine(idx, {
                          width: parseInt(e.target.value, 10) as 1 | 2 | 3 | 4,
                        })
                      }
                      className="rounded bg-tv-bg px-2 py-1 text-xs"
                    >
                      <option value={1}>1 — fino</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4 — grueso</option>
                    </select>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-tv-text-muted hover:text-tv-text"
        >
          Reset defaults
        </Button>
        <Button size="sm" onClick={save} className="bg-tv-blue hover:bg-tv-blue/90">
          Aplicar
        </Button>
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
