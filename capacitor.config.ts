import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configuración de Capacitor para empaquetar el static export de Next.js
 * como app Android.
 *
 * El build estático (Next `output: "export"`) va a `out/`. Para que la app
 * funcione dentro del WebView de Android:
 *  - `webDir` = "out" (donde Next deja el export).
 *  - `server.androidScheme` = "https" para que el WebView cargue con origen
 *    seguro `https://localhost` (necesario para cookies, fetch a APIs
 *    https, y para que no se mezclen con el esquema file://).
 *  -basePath del build debe ser VACÍO (no `/tradingview-free/` como en
 *    GitHub Pages), porque el WebView sirve desde raíz. Esto se controla
 *    por `NEXT_PUBLIC_BASE_PATH=""` en el build del APK.
 */
const config: CapacitorConfig = {
  appId: "app.tradingproview",
  appName: "TradingPro View",
  webDir: "out",
  android: {
    allowMixedContent: false,
    // Capture y back del hardware abren/cierran diálogos y native pickers
    // correctamente. Por default ya funciona, lo dejamos explícito.
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
