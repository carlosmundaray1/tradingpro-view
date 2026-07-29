# TradingPro View

App web (Next.js) que muestra charts de criptomonedas con datos en vivo de
Binance (REST + WebSocket), indicadores técnicos (EMA, ADX, Squeeze Momentum,
Volume Profile, etc.), watchlist y panel de quotes en tiempo real.

Live: <https://carlosmundaray1.github.io/tradingpro-view/>

> Nota: el repo GitHub se llama `tradingpro-view` y la URL pública es
> `https://carlosmundaray1.github.io/tradingpro-view/`. El workflow de
> Pages infiere el `basePath` automáticamente del nombre del repo.

## Stack

- Next.js 16 (App Router, static export)
- React 19 + TypeScript
- TailwindCSS 4
- lightweight-charts 5
- Zustand
- Binance REST + WS ( streams: `@kline_*`, `@miniTicker` )

## Desarrollo local

```powershell
npm install
npm run dev
# abre http://localhost:3000
```

> Siels bindings SWC nativos fallan (entornos con restricciones), usá Webpack:
>
> ```powershell
> npx next dev --webpack -p 3007
> ```

## Build estático (para GitHub Pages / Capacitor)

```powershell
# Variables para GitHub Pages (basePath = /tradingpro-view)
# Windows PowerShell
$env:NODE_ENV = "production"
$env:NEXT_PUBLIC_BASE_PATH = "/tradingpro-view"
npx next build --webpack
# output:  ./out/
```

Sin `NEXT_PUBLIC_BASE_PATH` se asume servir desde raíz del dominio.

## Deploy automático (GitHub Actions)

El workflow `.github/workflows/deploy.yml` corre en cada `push` a `main`:

1. Instala deps con `npm ci`.
2. Build con `NEXT_PUBLIC_BASE_PATH=/tradingpro-view`.
3. Sube `./out/` como artifact de GitHub Pages.
4. Publica la página.

Para habilitarlo (una sola vez):

1. Push inicial al repo GitHub `carlosmundaray1/tradingpro-view`.
2. Repo → **Settings** → **Pages** → **Source: GitHub Actions**.
3. Listo. La URL pública será
   <https://carlosmundaray1.github.io/tradingpro-view/>.

## Empaquetar como APK Android (Capacitor)

Requisitos: Android Studio instalado, Java JDK 17+.

```powershell
# 1) Instalar Capacitor y el runner de Android
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2) Inicializar Capacitor (si no se hizo todavía)
npx cap init "TradingPro View" "app.tradingproview" --web-dir=out

# 3) Build estático fresco (basePath nuevo del repo renombrado)
$env:NEXT_PUBLIC_BASE_PATH = "/tradingpro-view"
npx next build --webpack

# 4) Agregar plataforma Android (solo la primera vez)
npx cap add android

# 5) Sincronizar assets web al proyecto Android
npx cap copy android
npx cap sync android

# 6) Abrir en Android Studio
npx cap open android
```

Dentro de Android Studio:

1. **Build → Generate Signed Bundle / APK → APK**.
2. Crear keystore (o usar uno existente). Guardá la contraseña.
3. Build variant: `release`.
4. Finish → esperá que termina.
5. El APK queda en `android/app/build/outputs/apk/release/app-release.apk`.

Transferí el APK al teléfono y abrílo; Android te va a pedir permiso para
"instalar apps de origen desconocido".

> El APK carga el bundle local (`android/app/src/main/assets/public`) en un
> WebView con origen `https://localhost` (config en `capacitor.config.ts`).
> Para que el APK refleje cambios del web, regenerar el build estático y
> correr `npx cap sync android` + `gradlew assembleRelease`.

## Licencia / uso

Personal / educativo. Los datos provienen de Binance API pública.
