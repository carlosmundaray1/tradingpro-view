/**
 * Metadata visual de activos: logo URL + nombre completo amigable.
 *
 * - Cripto: logos desde cryptocurrency-icons (GitHub raw), nombres hardcoded.
 * - Forex: banderas SVG via flagcdn.com (gratis, estable).
 * - Índices: nombres descriptivos (BTCST = Satoshi, BTCDOM = BTC Dominance, etc).
 * - Commodities: oro tokenizado (XAUT/PAXG) con nombre "Tether Gold", "Pax Gold".
 * - Futuros perpetuals (Binance Futures): suffix ".P" al símbolo, mismo logo
 *   del base asset. Se identifican via `isPerpetual(symbol)`.
 *
 * Este módulo es SSR-safe: no usa Intl ni window APIs.
 */

// ───────────────────────────────────────────────────────────────────
//  Logos
// ───────────────────────────────────────────────────────────────────

/** Base de logos cripto (cryptocurrency-icons, repo publico). */
const LOGO_BASE_CRYPTO =
  "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color";

/** Base de logos de banderas para pares forex (flagcdn.com). */
const FLAG_BASE = "https://flagcdn.com/32";

/** Set de quoteAssets conocidos para separar base del símbolo. */
const STABLE_QUOTES = new Set([
  "USDT", "BUSD", "USDC", "TUSD", "FDUSD", "EUR", "TRY", "BTC", "ETH",
  "BNB", "XRP", "DOGE", "SOL",
  // Forex puro (divisas quote de Binance)
  "JPY", "AUD", "CAD", "CHF", "NZD", "BRL", "ARS", "ZAR", "MXN", "IDRT",
  "BVND", "RUB", "UAH", "PLN", "RON", "BIDR", "IDR", "GBP",
  // Stable menos comunes
  "DAI", "USDP", "USTC", "USD", "EURI", "AEUR", "USD1", "U",
]);

/** Devuelve el "base asset" de un símbolo dado (ej: BTCUSDT -> "BTC"). */
export function baseOf(symbol: string): string {
  for (const q of STABLE_QUOTES) {
    if (symbol.endsWith(q)) {
      return symbol.slice(0, symbol.length - q.length);
    }
  }
  return symbol;
}

/** Devuelve el quote asset del símbolo (ej: BTCUSDT -> "USDT"). */
export function quoteOf(symbol: string): string {
  for (const q of STABLE_QUOTES) {
    if (symbol.endsWith(q)) return q;
  }
  return "";
}

/** Devuelve la URL del logo del activo.
 *  - Cripto: cryptocurrency-icons (128px a color).
 *  - Forex: bandera del quoteAsset o baseAsset si es forex puro.
 *  - Commodities: emoji fallback (logo manual despues).
 *  - Si no conocido: null (el caller pinta un fallback con iniciales). */
export function logoUrl(symbol: string): string | null {
  // Caso especial: símbolos perpetual (futuros) — el logo es el base asset.
  const cleanSymbol = symbol.replace(/\.P$/, "").replace(/^\d+_/, "");
  const base = baseOf(cleanSymbol);
  const lower = base.toLowerCase();
  // Cripto: cryptocurrency-icons tiene .png para todos los conocidos.
  if (base.length > 0 && /^[A-Z0-9]+$/.test(base)) {
    return `${LOGO_BASE_CRYPTO}/${lower}.png`;
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────
//  Nombres amigables (display name)
// ───────────────────────────────────────────────────────────────────

/** Map de nombres largos de activos cripto / índices / commodities. */
const NAMES: Record<string, string> = {
  // Top cripto
  BTC: "Bitcoin",
  ETH: "Ethereum",
  BNB: "BNB",
  SOL: "Solana",
  XRP: "XRP",
  ADA: "Cardano",
  DOGE: "Dogecoin",
  AVAX: "Avalanche",
  LINK: "Chainlink",
  DOT: "Polkadot",
  MATIC: "Polygon",
  LTC: "Litecoin",
  TRX: "TRON",
  SHIB: "Shiba Inu",
  UNI: "Uniswap",
  ATOM: "Cosmos",
  XLM: "Stellar",
  NEAR: "NEAR Protocol",
  APT: "Aptos",
  FIL: "Filecoin",
  ARB: "Arbitrum",
  OP: "Optimism",
  INJ: "Injective",
  SUI: "Sui",
  SEI: "Sei",
  TIA: "Celestia",
  RUNE: "THORChain",
  AAVE: "Aave",
  MKR: "Maker",
  GRT: "The Graph",
  SAND: "The Sandbox",
  MANA: "Decentraland",
  AXS: "Axie Infinity",
  FTM: "Fantom",
  ALGO: "Algorand",
  EGLD: "MultiversX",
  FLOW: "Flow",
  THETA: "Theta Network",
  CHZ: "Chiliz",
  ENJ: "Enjin Coin",
  GALA: "Gala",
  USDC: "USD Coin",
  USDT: "Tether",
  BUSD: "Binance USD",
  FDUSD: "First Digital USD",
  TUSD: "TrueUSD",
  DAI: "Dai",
  USDP: "Pax Dollar",
  PEPE: "Pepe",
  BONK: "Bonk",
  WIF: "dogwifhat",
  FLOKI: "Floki",
  JUP: "Jupiter",
  PYTH: "Pyth Network",
  ORDI: "Ordinals",
  TON: "Toncoin",
  NOT: "Notcoin",
  RENDER: "Render",
  FET: "Fetch.ai",
  RNDR: "Render",
  WORLD: "Worldcoin",
  ARKM: "Arkham",
  BLUR: "Blur",
  GMX: "GMX",
  CRV: "Curve DAO",
  SNX: "Synthetix",
  COMP: "Compound",
  LDO: "Lido DAO",
  ENS: "Ethereum Name Service",
  BFFT: "BitForge Trash",
  CAKE: "PancakeSwap",
  XEC: "eCash",
  XMR: "Monero",
  DASH: "Dash",
  ZEC: "Zcash",
  KSM: "Kusama",
  GLMR: "Moonbeam",
  ASTR: "Astar",
  // Índices
  BTCST: "Satoshi",
  BTCDOM: "BTC Dominance",
  DEFI: "DeFi Index",
  INDEX: "DeFi Index",
  // Commodities (oro tokenizado)
  XAUT: "Tether Gold",
  PAXG: "Pax Gold",
  // Stable forex (de divisas fiat puras, no en spot real pero para futuro)
  EUR: "Euro",
  USD: "United States Dollar",
  GBP: "Pound Sterling",
  JPY: "Japanese Yen",
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
  CHF: "Swiss Franc",
  NZD: "New Zealand Dollar",
  TRY: "Turkish Lira",
  BRL: "Brazilian Real",
  ARS: "Argentine Peso",
  ZAR: "South African Rand",
  MXN: "Mexican Peso",
  RUB: "Russian Ruble",
  UAH: "Ukrainian Hryvnia",
  PLN: "Polish Zloty",
  RON: "Romanian Leu",
};

/** Devuelve el nombre completo amigable del activo. */
export function displayName(symbol: string): string {
  const clean = symbol.replace(/\.P$/, "").replace(/^\d+_/, "");
  const base = baseOf(clean);
  const mapped = NAMES[base.toUpperCase()];
  if (mapped) return mapped;
  // Forex puro (EURUSD, GBPUSD): descriptivo de la divisa base.
  if (base.length === 3 && /^[A-Z]{3}$/.test(base.toUpperCase())) {
    return NAMES[base.toUpperCase()] ?? base;
  }
  return base.toUpperCase();
}

// ───────────────────────────────────────────────────────────────────
//  Tags / badges (estilo TV Pro)
// ───────────────────────────────────────────────────────────────────

export type MarketTag = "CRYPTO" | "PERP" | "SPOT" | "INDEX" | "COMMODITY" | "FOREX" | "OTHER";

/** Devuelve el tag de mercado del símbolo. */
export function marketTag(symbol: string, category?: string): MarketTag {
  if (symbol.endsWith(".P")) return "PERP";
  if (category === "Índices") return "INDEX";
  if (category === "Commodities") return "COMMODITY";
  if (category === "Forex") return "FOREX";
  if (category === "Cripto") return "CRYPTO";
  return "OTHER";
}

/** Devuelve el color-tailwind del badge de mercado. */
export function marketTagColor(tag: MarketTag): string {
  switch (tag) {
    case "PERP":
      return "bg-amber-500/15 text-amber-400";
    case "SPOT":
      return "bg-tv-blue/15 text-tv-blue";
    case "INDEX":
      return "bg-purple-500/15 text-purple-400";
    case "COMMODITY":
      return "bg-yellow-500/15 text-yellow-500";
    case "FOREX":
      return "bg-emerald-500/15 text-emerald-400";
    case "CRYPTO":
      return "bg-tv-blue/15 text-tv-blue";
    default:
      return "bg-tv-text-muted/15 text-tv-text-muted";
  }
}

// ───────────────────────────────────────────────────────────────────
//  Futuros perpetuals
// ───────────────────────────────────────────────────────────────────

/** True si el símbolo es un perpetual future de Binance (fmt: XYZUSDT.P). */
export function isPerpetual(symbol: string): boolean {
  return symbol.endsWith(".P");
}

/** Convierte un símbolo spot en perpetual (ej: BTCUSDT -> BTCUSDT.P). */
export function toPerpetual(symbol: string): string {
  return symbol.endsWith(".P") ? symbol : `${symbol}.P`;
}

/** Convierte un símbolo perpetual en spot (ej: BTCUSDT.P -> BTCUSDT). */
export function toSpot(symbol: string): string {
  return symbol.endsWith(".P") ? symbol.slice(0, -2) : symbol;
}
