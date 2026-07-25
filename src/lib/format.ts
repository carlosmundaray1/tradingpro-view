/** Locale utilizado para el formato de precios en toda la app. Format
 *  Latinoamericano / España: miles con punto y decimales con coma, ej:
 *  63.234,56 (igual que TradingView en español). Antes usábamos "en-US"
 *  (1,234.56 — formato anglosajón con coma de miles y punto decimal). */
const PRICE_LOCALE = "es-AR";

/** Formatea un precio. Si se pasa `precision` explícito (ej: 4 para XRPUSDT),
 *  usa ese. Si no, infiere un fallback razonable según el rango del valor.
 *  El fallback inferior ("nodesplace") es 6 (microcaps como SHIB) — el path
 *  normal es usar getSymbolPrecision(symbol) en PriceChart para que todos los
 *  precios coincidan con el `tickSize` real de Binance y con TradingView.
 *
 *  Formato de salida: "63.234,56" (miles con punto, decimal con coma). */
export function formatPrice(n: number, precision?: number): string {
  if (!isFinite(n)) return "—";
  const opts: Intl.NumberFormatOptions = { useGrouping: true };
  if (typeof precision === "number" && precision >= 0) {
    if (n >= 1000) {
      // Para precios >= 1000 con precision explicita: agrupamos miles y
      // recortamos decimales a `precision` (con floor de 2).
      opts.minimumFractionDigits = Math.min(precision, 2);
      opts.maximumFractionDigits = precision;
      return n.toLocaleString(PRICE_LOCALE, opts);
    }
    // Para precios < 1000 no se agrupa, así que toFixed es suficiente.
    // Pero para ser consistente con el locale (coma decimal), usamos
    // toLocaleString también.
    opts.minimumFractionDigits = precision;
    opts.maximumFractionDigits = precision;
    opts.useGrouping = false;
    return n.toLocaleString(PRICE_LOCALE, opts);
  }
  // Sin precision: fallback por rango
  if (n >= 1000) {
    opts.maximumFractionDigits = 2;
    return n.toLocaleString(PRICE_LOCALE, opts);
  }
  if (n >= 1) {
    opts.minimumFractionDigits = 2;
    opts.maximumFractionDigits = 2;
    opts.useGrouping = false;
    return n.toLocaleString(PRICE_LOCALE, opts);
  }
  if (n >= 0.01) {
    opts.minimumFractionDigits = 4;
    opts.maximumFractionDigits = 4;
    opts.useGrouping = false;
    return n.toLocaleString(PRICE_LOCALE, opts);
  }
  opts.minimumFractionDigits = 6;
  opts.maximumFractionDigits = 6;
  opts.useGrouping = false;
  return n.toLocaleString(PRICE_LOCALE, opts);
}

export function formatPct(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toLocaleString(PRICE_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  })}%`;
}

export function formatVolume(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toLocaleString(PRICE_LOCALE, { maximumFractionDigits: 2 })}B`;
  if (n >= 1e6) return `${(n / 1e6).toLocaleString(PRICE_LOCALE, { maximumFractionDigits: 2 })}M`;
  if (n >= 1e3) return `${(n / 1e3).toLocaleString(PRICE_LOCALE, { maximumFractionDigits: 2 })}K`;
  return n.toLocaleString(PRICE_LOCALE, { maximumFractionDigits: 2 });
}
