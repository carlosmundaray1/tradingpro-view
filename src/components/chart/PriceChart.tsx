"use client";

import { useEffect, useRef, useState } from "react";
import type { UTCTimestamp } from "lightweight-charts";
import { fetchKlines, getSymbolPrecision, subscribeSymbolsCacheReady, areSymbolsCached } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import { useChartStore, type IndicatorInstance } from "@/lib/store/chart-store";
import { formatPrice, formatVolume } from "@/lib/format";
import { useChart } from "./useChart";
import { IndicatorPill } from "./IndicatorPill";
import { MeasureOverlay } from "./MeasureOverlay";
import { DrawingOverlay } from "./DrawingOverlay";
import { getDescriptor } from "@/lib/indicators/catalog";
import type { Timeframe } from "@/lib/binance/types";
import { candleCloseTime, formatCountdown } from "@/lib/binance/timeframe";

interface Props {
  symbol: string;
  timeframe: string;
}

type KlineInterval = Timeframe;

export function PriceChart({ symbol, timeframe }: Props) {
  const {
    containerRef,
    chartRef,
    candleSeriesRef,
    candlesRef,
    hover,
    crosshair,
    lastPrice,
    setLastPrice,
    paneOffsets,
    lastValues,
    thresholdLabels,
    measureCoords,
    preview,
    drawingsRecalcTick,
    trendLines: allTrendLines,
    fibRetracements: allFibs,
    longPositions: allLongs,
    textNotes: allTextNotes,
    brushStrokes: allBrushStrokes,
    removeTrendLine,
    removeFibRetracement,
    removeLongPosition,
    removeTextNote,
    removeBrushStroke,
    updateTextNote,
    notifyCandlesChanged,
    candlesVersion,
  } = useChart(symbol, timeframe);

  const instances = useChartStore((s) => s.instances);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const setSettingsTargetId = useChartStore((s) => s.setSettingsTargetId);

  // Precisión del precio según el tickSize real de Binance para este símbolo.
  // Esto asegura que los labels (OHLC, último precio, pills) muestren la misma
  // cantidad de decimales que TradingView Pro (BTC=2, XRP=4, DOGE=5, SHIB=8...).
  // Si fetchExchangeSymbols todavía no cargó, getSymbolPrecision retorna 2.
  // Re-leemos cuando el cache se completa (preload inicial post-mount) para
  // que el primer render no se quede con el fallback.
  const [symbolsReady, setSymbolsReady] = useState<boolean>(areSymbolsCached());
  useEffect(() => {
    if (symbolsReady) return;
    const unsub = subscribeSymbolsCacheReady(() => setSymbolsReady(true));
    return unsub;
  }, [symbolsReady]);
  // symbolsReady sólo fuerza re-render cuando el cache pasa de null → listo.
  void symbolsReady;
  const pricePrecision = getSymbolPrecision(symbol);

  // Force a re-render when new candle arrives so pills update.
  const [, setRenderTick] = useState(0);

  // Countdown regresivo de la vela en formación (estilo TradingView Pro).
  // Tick cada 250ms para que el cambio de segundo sea fluido. Calcula los
  // ms restantes hasta el cierre de la vela actual (open de la última vela
  // + duración del timeframe). Cuando la vela cierra y llega la siguiente
  // del WS, se re-calcula solo porque candlesRef.current crece.
  const [countdown, setCountdown] = useState<string | null>(null);
  // Posición Y (en像素, dentro del chart container) del último close para
  // alinear el recuadro del precio al eje derecho. Actualizado por RAF.
  const [lastPriceY, setLastPriceY] = useState<number | null>(null);
  const tfRef = useRef<Timeframe>(timeframe as Timeframe);
  useEffect(() => {
    tfRef.current = timeframe as Timeframe;
    // RAF loop: actualiza el countdown cada 250ms (relajado) y la posición Y
    // del último close cada frame (barato: priceToCoordinate es lookup local).
    let lastCountdownAt = 0;
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      if (now - lastCountdownAt >= 250) {
        lastCountdownAt = now;
        const candles = candlesRef.current;
        if (!candles || candles.length === 0) {
          setCountdown(null);
        } else {
          const lastCandle = candles[candles.length - 1];
          const tf = tfRef.current;
          const closeTimeMs = candleCloseTime(tf, lastCandle.time);
          const remaining = closeTimeMs - now;
          setCountdown(formatCountdown(remaining, tf));
        }
      }
      // Posición Y del último close para alinear el recuadro de precio.
      const cs = candleSeriesRef.current;
      const lp = lastPrice;
      if (cs && lp) {
        const y = cs.priceToCoordinate(lp.value);
        if (y !== null && isFinite(y)) setLastPriceY(y);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [candlesRef, candleSeriesRef, lastPrice]);

  // ─── Load historical + subscribe live ─────────────────────────
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    async function load() {
      try {
        const klines = await fetchKlines(symbol, timeframe as KlineInterval, 1000);
        if (cancelled) return;
        candlesRef.current = klines;
        if (candleSeriesRef.current) {
          candleSeriesRef.current.setData(
            klines.map((k) => ({
              time: k.time as UTCTimestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            })),
          );
        }
        chartRef.current?.timeScale().fitContent();
        // Forzar que el effect de reconcile de instancias en useChart vuelva a
        // correr con las velas ya cargadas. Sin esto, tras Ctrl+Shift+R las
        // instances persisten en el store pero las series quedan vacías
        // porque el effect se ejecutó ANTES de que las velas llegaran.
        notifyCandlesChanged();
        if (klines.length > 0) {
          const last = klines[klines.length - 1];
          const prev = klines[klines.length - 2] ?? last;
          setLastPrice({
            value: last.close,
            pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
          });
        }

        const ws = getBinanceWS();
        unsub = ws.subscribeKline({
          symbol,
          interval: timeframe as KlineInterval,
          onCandle: (k) => {
            if (!candleSeriesRef.current) return;
            const arr = candlesRef.current;
            const lastCandle = arr[arr.length - 1];
            if (lastCandle && lastCandle.time === k.time) {
              arr[arr.length - 1] = k;
            } else if (!lastCandle || k.time > lastCandle.time) {
              arr.push(k);
              // No recortamos arr: el scroll-infinito carga histórico a la
              // izquierda y el WS agrega velas nuevas a la derecha. Limitar
              // el tamaño podría pisar el histórico cargado bajo demanda.
            } else {
              return;
            }
            candleSeriesRef.current.update({
              time: k.time as UTCTimestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            });
            const prev = arr[arr.length - 2] ?? lastCandle;
            setLastPrice({
              value: k.close,
              pct: prev && prev.close !== 0 ? ((k.close - prev.close) / prev.close) * 100 : 0,
            });
            setRenderTick((t) => t + 1);
          },
        });
      } catch (e) {
        console.error("Failed to load chart data:", e);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [symbol, timeframe, candlesRef, candleSeriesRef, chartRef, setLastPrice, notifyCandlesChanged]);

  // ─── Scroll infinito hacia la izquierda (carga histórica on-demand) ─────
  // El chart carga inicialmente las últimas 1000 velas del timeframe. Cuando
  // el usuario hace scroll hacia la izquierda y se acerca al extremo de los
  // datos cargados, este effect dispara una carga adicional de 1000 velas
  // más antiguas (terminando justo antes de la primer vela existente) y las
  // pre-concatena a candlesRef.current. lightweight-charts lo soporta vía
  // setData() reconstruyendo toda la serie (es la forma más robusta aunque
  // menos eficiente; para 2000-3000 velas es instantáneo).
  //
  // Mantenemos un flag `loadingMore` para evitar disparar dos cargas en
  // paralelo (race condition). También evitamos disparar si no hay velas o
  // si el symbol/timeframe está cambiando (cleanup). El `endTime` que pasamos
  // a fetchKlines es el `time` de la primer vela ya cargada (en milisegundos)
  // para pedir "lo que esté ANTES" de ese momento.
  const loadingMoreRef = useRef(false);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candleSeriesRef.current || !candlesRef.current) return;
    const ts = chart.timeScale();

    function onVisibleRangeChange() {
      const candles = candlesRef.current;
      if (!candles || candles.length === 0) return;
      if (loadingMoreRef.current) return;
      const lr = ts.getVisibleLogicalRange();
      if (!lr) return;
      // Disparar carga cuando el borde izquierdo visible está dentro de las
      // primeras 50 velas cargadas. Eso da margen para que el usuario siga
      // scrolleando sin llegar al vacío mientras carga.
      if (lr.from > 50) return;
      const firstCandle = candles[0];
      // endTime = openTime de la primer vela - 1 ms (para no traerla de nuevo).
      const endTimeMs = firstCandle.time * 1000 - 1;
      loadingMoreRef.current = true;
      fetchKlines(symbol, timeframe as KlineInterval, 1000, endTimeMs)
        .then((older) => {
          // El WS pudo haber agregado velas nuevas mientras cargábamos. Para
          // evitar duplicar, filtramos las que ya tenemos por time.
          const existingTimes = new Set(candlesRef.current.map((c) => c.time));
          const unique = older.filter((c) => !existingTimes.has(c.time));
          if (unique.length === 0) return; // no había más histórico
          // Concatenar al PRINCIPIO (más viejas primero).
          const prevFrom = ts.getVisibleLogicalRange()?.from ?? null;
          const prevTo = ts.getVisibleLogicalRange()?.to ?? null;
          candlesRef.current = [...unique, ...candlesRef.current];
          // setData reconstruye toda la serie. Rápido para ~2-3k velas.
          candleSeriesRef.current?.setData(
            candlesRef.current.map((k) => ({
              time: k.time as UTCTimestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            })),
          );
          // Mantener la posición de scroll restaurando el rango lógico previo,
          // pero desplazado por la cantidad de velas nuevas agregadas. Así el
          // chart no salta al inicio — el usuario ve el mismo contenido que
          // antes, con histórico nuevo a la izquierda.
          if (prevFrom !== null && prevTo !== null) {
            try {
              ts.setVisibleLogicalRange({
                from: prevFrom + unique.length,
                to: prevTo + unique.length,
              } as unknown as { from: number; to: number });
            } catch {}
          }
          // Notificar al useChart que las velas cambiaron para que recalcule
          // indicadores sobre el nuevo histórico.
          notifyCandlesChanged();
        })
        .catch((e) => {
          console.error("Scroll-infinito failed:", e);
        })
        .finally(() => {
          loadingMoreRef.current = false;
        });
    }

    ts.subscribeVisibleLogicalRangeChange(onVisibleRangeChange);
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange);
      loadingMoreRef.current = false;
    };
  }, [symbol, timeframe, chartRef, candleSeriesRef, candlesRef, notifyCandlesChanged, candlesVersion]);

  const greenOrRed = (n: number) => (n >= 0 ? "text-tv-green" : "text-tv-red");

  // Pane assignment mirror (matches useChart) for label positioning.
  // Replicamos la MISMA lógica de `useChart.ts` para que los pills se
  // posicionen en el pane donde lightweight-charts realmente dibuja la
  // serie del indicador. Sin esto, un indicador con `overlayPaneIndex: N`
  // (ej: ADX sobre el pane del Squeeze) recibiría aquí un paneIdx
  // incorrecto y el pill no renderizaría (paneOffsets[paneIdx] === undefined).
  //  - pane "overlay"/"volume" => 0
  //  - pane "separate" SIN overlayPaneIndex => pane 1, 2, 3... (dedicado)
  //  - pane "separate" CON overlayPaneIndex=N => mismo pane que el N-ésimo
  //    separate (en orden de aparición); si N fuera fuera de rango, pane nuevo.
  const visibleInstances = instances.filter((i) => !i.hidden);
  const paneAssign = new Map<string, number>();
  const separateOrder: string[] = [];
  for (const inst of visibleInstances) {
    const desc = getDescriptor(inst.type);
    if (desc.pane === "separate") {
      if (inst.overlayPaneIndex !== undefined && inst.overlayPaneIndex >= 1) {
        paneAssign.set(inst.id, -1); // se resuelve en la segunda pasada
      } else {
        separateOrder.push(inst.id);
      }
    } else {
      paneAssign.set(inst.id, 0);
    }
  }
  separateOrder.forEach((id, i) => paneAssign.set(id, i + 1));
  const totalNonOverlaySeparate = separateOrder.length;
  let extraCounter = totalNonOverlaySeparate;
  for (const inst of visibleInstances) {
    const desc = getDescriptor(inst.type);
    if (desc.pane !== "separate") continue;
    if (inst.overlayPaneIndex === undefined || inst.overlayPaneIndex < 1) continue;
    const N = inst.overlayPaneIndex;
    if (N >= 1 && N <= totalNonOverlaySeparate) {
      const targetId = separateOrder[N - 1];
      paneAssign.set(inst.id, paneAssign.get(targetId) ?? 0);
    } else {
      extraCounter++;
      paneAssign.set(inst.id, extraCounter);
    }
  }
  const pillsByPane = new Map<number, IndicatorInstance[]>();
  for (const inst of instances) {
    if (inst.hidden) continue;
    const p = paneAssign.get(inst.id) ?? 0;
    if (!pillsByPane.has(p)) pillsByPane.set(p, []);
    pillsByPane.get(p)!.push(inst);
  }
  for (const arr of pillsByPane.values()) {
    arr.sort((a, b) => b.order - a.order);
  }

  return (
    <div className="relative h-full w-full">
      {/* El chart vive en su propio stacking context (relative + z-0) para que
         los overlays (pills de los indicadores, medida, etc.) con z-10/z-20
         queden GUARANTEED por encima de cualquier elemento del chart (canvas,
         priceScale labels, etc.). Sin esto, los labels del eje Y del ADX
         (0/20/40) se venían por encima de la pill del indicador. */}
      <div ref={containerRef} className="relative z-0 h-full w-full" />
      {measureCoords && (
        <MeasureOverlay
          aX={measureCoords.aX}
          aY={measureCoords.aY}
          bX={measureCoords.bX}
          bY={measureCoords.bY}
          priceDiff={measureCoords.priceDiff}
          pctChange={measureCoords.pctChange}
          bars={measureCoords.bars}
          volume={measureCoords.volume}
          durationText={measureCoords.durationText}
          isUp={measureCoords.isUp}
          isPreview={measureCoords.isPreview}
        />
      )}

      {/* DrawingOverlay — dibujos persistidos (líneas de tendencia, fib,
          posición larga) + preview while placing. SVG puro sobre el chart
          (z-20), pointer-events-none salvo en los botones × de borrado. */}
      <DrawingOverlay
        candleSeriesRef={candleSeriesRef}
        chartRef={chartRef}
        trendLines={allTrendLines.filter((t) => t.symbol === symbol)}
        fibRetracements={allFibs.filter((f) => f.symbol === symbol)}
        longPositions={allLongs.filter((p) => p.symbol === symbol)}
        textNotes={allTextNotes.filter((n) => n.symbol === symbol)}
        brushStrokes={allBrushStrokes.filter((s) => s.symbol === symbol)}
        recalcTick={drawingsRecalcTick}
        preview={preview}
        onRemove={(kind, id) => {
          if (kind === "trend") removeTrendLine(id);
          else if (kind === "fib") removeFibRetracement(id);
          else if (kind === "long") removeLongPosition(id);
          else if (kind === "text") removeTextNote(id);
          else if (kind === "brush") removeBrushStroke(id);
        }}
        onUpdateText={(id, text) => updateTextNote(id, text)}
      />

      {/* Top-left: symbol info + OHLC on hover + big live price */}
      <div
        style={{ top: (paneOffsets[0]?.top ?? 0) + 12, left: 12 }}
        className="pointer-events-none absolute z-20 flex flex-col gap-1 text-xs tabular-nums"
      >
        <div className="flex h-5 flex-nowrap items-center gap-x-3 overflow-hidden whitespace-nowrap">
          <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold">
            <span className="text-tv-text">{symbol}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="uppercase text-tv-text-muted">{timeframe}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="text-tv-text-muted">Binance</span>
          </div>
          {hover && (
            <div className="flex items-center gap-x-3 text-[11px]">
              <span className="text-tv-text-muted">
                O <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.o, pricePrecision)}</span>
              </span>
              <span className="text-tv-text-muted">
                H <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.h, pricePrecision)}</span>
              </span>
              <span className="text-tv-text-muted">
                L <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.l, pricePrecision)}</span>
              </span>
              <span className="text-tv-text-muted">
                C <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.c, pricePrecision)}</span>
              </span>
              <span className={greenOrRed(hover.pct)}>
                {hover.pct >= 0 ? "+" : ""}
                {hover.pct.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        <div className="flex h-5 items-center gap-2">
          {lastPrice ? (
            <>
              <span className={`text-[15px] font-semibold tabular-nums ${greenOrRed(lastPrice.pct)}`}>
                {formatPrice(lastPrice.value, pricePrecision)}
              </span>
              <span className={`text-[11px] ${greenOrRed(lastPrice.pct)}`}>
                {lastPrice.pct >= 0 ? "+" : ""}
                {lastPrice.pct.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-xs text-tv-text-muted">Cargando…</span>
          )}
        </div>
      </div>

      {/* Pills por pane — dibujadas arriba del pane correspondiente */}
      {Array.from(pillsByPane.entries()).map(([paneIdx, list]) => {
        const offset = paneOffsets[paneIdx];
        if (!offset) return null;
        // Reserva el ancho del eje Y derecho de este pane (+ 8px de aire)
        // para que el pill no sea tapado por los labels (precio del BTC en
        // pane 0, 0/20/40 del ADX en panes osciladores, etc.).
        // Fallback a 76px si todavía no se midió el eje (pane recién creado,
        // `width()` retorno 0 antes del primer layout).
        const measured = offset.rightAxisWidth ?? 0;
        // En panes osciladores (pane > 0) el axisLabel del threshold
        // priceLine se dibuja sobre el eje derecho a la altura Y del precio
        // del threshold (zona superior típica del pane para ADX/RSI con valores
        // altos). Para evitar que el recuadro blanco "23.00" tape el pill,
        // empujamos el pill más a la izquierda en panes osciladores (+36px
        // extra) reservando espacio para el axisLabel. En pane 0 (precio) no
        // hay threshold priceLine y el margen mínimo es suficiente.
        const axisExtra = paneIdx > 0 ? 36 : 0;
        const rightPad = Math.max(76 + axisExtra, measured + 8 + axisExtra);
        return (
          <div
            key={`pane-${paneIdx}`}
            style={{
              top: paneIdx === 0 ? offset.top + 64 : offset.top + 4,
              left: 12,
              right: rightPad,
            }}
            className="pointer-events-none absolute z-30 flex flex-row flex-wrap items-center gap-x-1.5 gap-y-1"
          >
            {list.map((inst) => {
              const lv = lastValues[inst.id];
              const desc = getDescriptor(inst.type);
              const valueText = buildPillValueText(inst, lv, pricePrecision);
              const firstColor = inst.colors[desc.series[0].key] ?? desc.series[0].color;
              return (
                <IndicatorPill
                  key={inst.id}
                  instanceId={inst.id}
                  name={lv?.label ?? desc.name}
                  value={valueText}
                  color={firstColor}
                  hidden={inst.hidden}
                  onToggleHide={() => toggleHidden(inst.id)}
                  onSettings={() => setSettingsTargetId(inst.id)}
                  onRemove={() => removeIndicator(inst.id)}
                />
              );
            })}
          </div>
        );
      })}

      {/* Threshold labels — texto completo "threshold 23.00" renderizado como
          div DOM porque lightweight-charts v5 trunca el `title` nativo del
          priceLine a ~5 letras ("thres"). Lo posicionamos a la izquierda del
          eje derecho del pane, sobre la línea horizontal del threshold, a la
          altura Y calculada con `series.priceToCoordinate`. El recuadro
          "23.00" del axisLabel sigue visible del lado derecho del eje. */}
      {thresholdLabels.map((tl, i) => {
        const offset = paneOffsets[tl.paneIndex];
        if (!offset || !Number.isFinite(tl.y)) return null;
        const measured = offset.rightAxisWidth ?? 0;
        const rightPad = Math.max(76, measured + 8);
        // Pequeño offset vertical para alinear el centro del texto con la línea
        const top = offset.top + tl.y - 7;
        return (
          <div
            key={`tl-${tl.instanceId}-${i}`}
            style={{
              top,
              right: rightPad + 4,
              color: tl.color,
            }}
            className="pointer-events-none absolute z-20 bg-tv-bg/80 px-1 text-[10px] leading-none tabular-nums ring-1 ring-tv-border/40"
          >
            {tl.text}
          </div>
        );
      })}

      <div className="pointer-events-none absolute bottom-1 right-2 z-10 text-[10px] text-tv-text-dim">
        Charts by TradingView Lightweight Charts™
      </div>

      {/* Recuadro del último precio estilo TradingView Pro — naranja/coral
          (#FF6B57) DENTRO del priceScale derecho del pane 0, alineado al borde
          derecho del eje (igual que lwc pinta todos sus axisLabels, incluido
          el recuadro blanco del crosshair). El ancho del eje se fuerza con
          `minimumWidth: 80` en `useChart.ts` para que el precio completo
          entre (incluido BTC "64.568,69") sin desbordarse al chart area.
          Bajamos el z-index para que el crosshair label blanco (div DOM de
          abajo) se posé encima cuando el cursor coincide en Y con el precio. */}
      {lastPrice && lastPriceY !== null && paneOffsets[0] && paneOffsets[0].rightAxisWidth > 0 && (
        <div
          style={{
            position: "absolute",
            top: (paneOffsets[0]?.top ?? 0) + lastPriceY - 14,
            right: 0,
            width: paneOffsets[0].rightAxisWidth,
            zIndex: 1,
          }}
          className="pointer-events-none flex h-[28px] flex-col items-center justify-center rounded-l-[2px] bg-[#FF6B57] px-1 font-mono tabular-nums leading-tight shadow-sm"
        >
          <span className="truncate text-[12px] font-semibold text-white">
            {formatPrice(lastPrice.value, pricePrecision)}
          </span>
          {countdown && (
            <span className="mt-[1px] truncate text-[10px] text-white/85">{countdown}</span>
          )}
        </div>
      )}

      {/* Recuadro blanco del crosshair en el eje de precios (replica TV Pro):
          pinta el valor del punto Y donde el cursor está parado, en un
          recuadro blanco con texto negro, sobre el priceScale derecho del
          pane donde el cursor está. En el pane 0 eso es el precio del activo;
          en panes osciladores es el valor del oscilador. Cuando el cursor
          coincide en Y con el último precio, este recuadro se posa encima
          del naranja (zIndex 2 > 1) y lo tapa, igual que en TradingView Pro.
          Replicar como div DOM porque el label nativo de lwc vive en el canvas
          del eje, que queda por debajo de cualquier div DOM overlay, así que
          lwc no podría posar su blanco encima del naranja. */}
      {crosshair && paneOffsets[crosshair.paneIndex] && paneOffsets[crosshair.paneIndex].rightAxisWidth > 0 && (
        <div
          style={{
            position: "absolute",
            top: (paneOffsets[crosshair.paneIndex]?.top ?? 0) + crosshair.y - 11,
            right: 0,
            width: paneOffsets[crosshair.paneIndex].rightAxisWidth,
            zIndex: 2,
          }}
          className="pointer-events-none flex h-[22px] items-center justify-center rounded-l-[2px] bg-[#d1d4dc] px-1 font-mono text-[11px] font-semibold tabular-nums leading-tight text-[#131722] shadow-sm"
        >
          <span className="truncate">
            {crosshair.paneIndex === 0
              ? formatPrice(crosshair.price, pricePrecision)
              : crosshair.price.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

function buildPillValueText(
  inst: IndicatorInstance,
  lv: { label: string; values: Record<string, number | undefined> } | undefined,
  pricePrecision: number,
): string | undefined {
  if (!lv) return undefined;
  const desc = getDescriptor(inst.type);
  // Osciladores (pane separado) NO son precios: su valor es adimensional
  // (ej: RSI 0..100, MFI 0..100, CCI, Williams %R -100..0, CMO -100..100,
  // ADX 0..100). Mostrarlos con `pricePrecision` del simbolo activo es un
  // bug: un ADX de 28.6 en XRPUSDT (prec=4) se veria como "28.6000", y en
  // SHIBUSDT (prec=8) como "28.60000000" — ambos confusos. Usamos .toFixed(2)
  // genérico de oscilador en su lugar, igual que TradingView Pro.
  const isOscillator = desc.pane === "separate";
  // Helper para formatear valores no-precio (osciladores).
  const fmtOsc = (v: number): string => {
    if (!isFinite(v)) return "—";
    // Conservar signo negativo (CMO, Williams %R, CCI pueden ser negativos).
    return v.toFixed(2);
  };
  const parts: string[] = [];
  for (const spec of desc.series) {
    // Respetar series ocultas (ej: +DI/-DI del ADX por default no se muestran
    // en el pill). Así el pill del ADX sólo muestra el valor del ADX (0..100),
    // igual que en TradingView Pro, sin confusiones con DI extraños.
    // Considerar inst.seriesHidden (override del usuario) y, si no está seteado,
    // el defaultHidden del descriptor del catálogo (fallback para instancias
    // viejas persistidas antes de que seriesHidden se sanea en el migrate).
    const hidden = inst.seriesHidden?.[spec.key] ?? spec.defaultHidden ?? false;
    if (hidden) continue;
    const v = lv.values[spec.key];
    if (v === undefined || !isFinite(v)) continue;
    if (spec.shape === "hist" || spec.shape === "hist-signed") {
      // Histogramas (ej: volumen) usan su propio formato compacto K/M/B.
      parts.push(formatVolume(v));
    } else if (isOscillator) {
      parts.push(fmtOsc(v));
    } else {
      // Precio/overlay media (SMA/EMA/Bbands/etc): formatear como precio
      // del simbolo activo, igual que en TradingView Pro.
      parts.push(formatPrice(v, pricePrecision));
    }
  }
  return parts.length === 0 ? undefined : parts.join(" · ");
}
