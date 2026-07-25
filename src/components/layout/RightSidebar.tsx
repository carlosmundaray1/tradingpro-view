"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ListTree, Watch as WatchIcon } from "lucide-react";
import { IndicatorPanel } from "./IndicatorPanel";
import { Watchlist } from "@/components/watchlist/Watchlist";
import { QuotesPanel } from "@/components/quotes/QuotesPanel";
import { AssetDetail } from "@/components/quotes/AssetDetail";
import { cn } from "@/lib/utils";
import { useChartStore } from "@/lib/store/chart-store";

type Tab = "watchlist" | "indicators";

const TABS: { key: Tab; label: string; icon: typeof WatchIcon }[] = [
  { key: "watchlist", label: "Watchlist", icon: WatchIcon },
  { key: "indicators", label: "Indicadores", icon: ListTree },
];

/**
 * Sidebar derecho estilo TradingView Pro.
 *
 * Layout vertical con DOS sub-paneles y un separador horizontal arrastrable:
 *
 *   ┌────────────────────┐
 *   │ Watchlist/Indic.    │  ← altura = topHeight (drag para cambiar)
 *   │  ...               │
 *   ├──══════════════════│  ← separador 5px, cursor: row-resize
 *   │ Quotes             │  ← altura = flex-1 (ocupa el resto)
 *   │  BTC  63,250 +1.2%│
 *   └────────────────────┘
 *
 * El drag se hace sobre `pointermove` global mientras esté apretado. El
 * `topHeight` se persiste en localStorage.
 */
const STORAGE_KEY = "tv-gratis-right-sidebar-split";
// Altura mínima del sub-panel SUPERIOR. Debe ser sólo la altura del header
// (~36px — fila h-9 del título "Watchlist"/"Indicadores" con borde). Con
// esto el separador se puede arrastrar hasta justo debajo de la pestaña,
// dejando sólo el título y colapsando las filas de la lista. Antes 140,
// dejaba un gap muerto arriba que no se podía cubrir.
const MIN_TOP = 36;
const MIN_BOTTOM = 160;
const DEFAULT_TOP_PCT = 55; // % del alto total
const SEPARATOR_HEIGHT = 5; // px del separador (h-1 + algo más)

export function RightSidebar() {
  const [tab, setTab] = useState<Tab>("watchlist");
  const count = useChartStore((s) => s.instances.length);
  const symbol = useChartStore((s) => s.symbol);
  const containerRef = useRef<HTMLDivElement>(null);

  // Altura del sub-panel SUPERIOR en píxeles. Lazy initializer lee localStorage
  // en el primer render; si no había valor guardado queda null → el primer
  // layout effect lo setea al DEFAULT_TOP_PCT del contenedor real.
  const [topHeight, setTopHeight] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  // Cargar el topHeight persistido del localStorage DESPUÉS del mount, para
  // evitar errores de hydration: el server renderiza con null (default =
  // flex-1 en ambos paneles); el cliente lee localStorage en el effect y
  // setea el valor persistido — lo cual sólo cambia el layout después del
  // render inicial, sin que React detecte una diferencia con el HTML del
  // server. (Esto esidiomático en Next.js con datos que son sólo-cliente.)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const v = parseInt(saved, 10);
        if (!Number.isNaN(v) && v >= MIN_TOP) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setTopHeight(v);
          return;
        }
      }
    } catch {}
    // Sin valor persistido → usar % del alto del contenedor medido.
    const el = containerRef.current;
    if (el) {
      const h = el.clientHeight;
      if (h > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTopHeight(Math.round((h * DEFAULT_TOP_PCT) / 100));
      }
    }
  }, []);

  // Persistir al SOLTAR el drag (no en cada frame → evita escrituras
  // innecesarias y re-renders).
  useEffect(() => {
    if (!dragging && topHeight !== null) {
      try {
        localStorage.setItem(STORAGE_KEY, String(topHeight));
      } catch {}
    }
  }, [topHeight, dragging]);

  // Ref para que el handler global lea el estado dragging sin re-subscribirse.
  const draggingRef = useRef(false);
  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  // Pointer move + up globales (mientras dragging). Lo manejamos acá en vez
  // de en el separador para que el usuario pueda arrastrar fuera del rect del
  // separador sin perder el capture.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // topHeight = cursorY - rect.top (relativo al contenedor)
      // clamp: no permite achicar más que MIN_TOP arriba ni más que
      // (total - SEPARATOR - MIN_BOTTOM) arriba.
      const maxTop = rect.height - SEPARATOR_HEIGHT - MIN_BOTTOM;
      const newY = Math.max(MIN_TOP, Math.min(maxTop, e.clientY - rect.top));
      setTopHeight(Math.round(newY));
    };
    const onUp = () => {
      if (draggingRef.current) setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const onSeparPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, []);

  return (
    <aside className="flex w-64 flex-col border-l border-tv-border bg-tv-panel">
      <div className="flex border-b border-tv-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex h-9 flex-1 items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
              tab === t.key
                ? "border-b border-tv-blue bg-tv-bg text-tv-text"
                : "border-b border-transparent text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {t.key === "indicators" && count > 0 && (
              <span className="ml-0.5 rounded bg-tv-blue/20 px-1 py-0.5 text-[10px] font-medium text-tv-blue">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>
      {/* Contenedor del split. overflow-hidden CRÍTICO para que los ScrollArea
          internos sepan que tienen una altura acotada por el contenedor padre y
          no se desborden. Sin esto, los paneles crecen verticalmente al
          infinito y la rueda del mouse no tiene nada para scrollear. */}
      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {/* Sub-panel superior (Watchlist / Indicadores). Mientras topHeight es
            null (primer render + SSR) usa flex-basis del contenedor.
            Una vez medido/persistido, pasa a altura fija en píxeles.
            `shrink-0` para que no se comprima por el otro panel. */}
        <div
          style={
            topHeight !== null
              ? { height: `${topHeight}px`, flexGrow: 0, flexShrink: 0 }
              : { flexGrow: 0, flexShrink: 0, flexBasis: "55%" }
          }
          className="flex min-h-0 flex-col overflow-hidden bg-tv-panel"
        >
          {/* Wrapper h-full para que el panel interno (con h-full) pueda
              resolver el height:100% del ScrollArea anidado. */}
          <div className="flex h-full min-h-0 flex-col">
            {tab === "watchlist" && <Watchlist />}
            {tab === "indicators" && <IndicatorPanel />}
          </div>
        </div>

        {/* Separador horizontal drag-resizable.
            Color: usa tv-text-dim (#50535e) — gris más claro que tv-border
            (#2a2e39), con lo cual SE DISTINGUE claramente del panel contiguo
            (tv-panel #1e222d) y del fondo del sidebar (tv-panel). 5px de alto
            con cursor row-resize, hover azul. */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-valuenow={topHeight ?? undefined}
          onPointerDown={onSeparPointerDown}
          onDoubleClick={() => setTopHeight(null)}
          title="Arrastrá para cambiar el tamaño. Doble click para resetear."
          className={cn(
            "group relative z-20 h-[5px] w-full shrink-0 cursor-row-resize bg-tv-text-dim",
            "transition-colors",
            dragging ? "bg-tv-blue" : "hover:bg-tv-blue",
          )}
        />

        {/* Sub-panel inferior (Quotes) — un contenedor vertical con DOS sub-
            sub-paneles: la lista scrolleable (arriba) + el detalle (abajo).
            Sin separador drag (proporción fija 55/45); el detalle siempre
            visible aunque la lista tenga 1 solo activo.

            TRAMPA CLAVE de este layout flex anidado:
            - El ScrollArea interno usa `size-full` (width/height 100%) en su
              Viewport. Para que el `height: 100%` resuelva a un valor real (y
              no a 0 o "auto"), TODOS los ancestros intermedios deben tener una
              altura delimitada: o bien `height` explícita en px, o bien un
              `flex-basis` explícito con `flex-grow: 0 / shrink: 0` para que el
              flex algorithm le compute una altura concreta.
            - Si ponemos `flex-1` (= `1 1 0%`) en el wrapper interior, el flex
              basis 0 deja el cálculo solo a `flex-grow` — y como el padre tiene
              altura `auto` por `flex-1`, todo se resuelve a contenido intrínseco
              -> sin overflow -> sin scroll -> la altura efectiva crece y el
              panel se superpone al otro, dejando el "transparente".
            - Solución: wrapper con `flex-basis: %` explícito + `grow-0 shrink-0`
              y dentro hijo `h-full` (que ahora sí resuelve contra un ancestro
              con altura computada). */}
        <div
          style={
            topHeight !== null
              ? { flexGrow: 1, flexBasis: "0%", minHeight: 0 }
              : { flexGrow: 1, flexBasis: "45%", minHeight: 0 }
          }
          className="flex min-h-0 flex-col overflow-hidden bg-tv-bg"
        >
          {/* Lista arriba (55% del panel inferior, scrolleable).
              `grow-0 shrink-0` + `flexBasis: 55%` -> el flex algorithm le
              computa una altura concreta del 55% del panel inferior. */}
          <div
            className="flex min-h-0 flex-col overflow-hidden"
            style={{ flexGrow: 0, flexShrink: 0, flexBasis: "55%" }}
          >
            <div className="flex h-full min-h-0 flex-col">
              <QuotesPanel />
            </div>
          </div>
          {/* Detalle abajo (45% del panel inferior). bg-tv-panel explícito en el
              contenedor exterior e interior para asegurar un fondo opaco que
              tape la lista de atrás (elimina el sintoma "transparente"). */}
          <div
            className="flex min-h-0 flex-col overflow-hidden bg-tv-panel"
            style={{ flexGrow: 0, flexShrink: 0, flexBasis: "45%" }}
          >
            <div className="flex h-full min-h-0 flex-col bg-tv-panel">
              <AssetDetail symbol={symbol} />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
