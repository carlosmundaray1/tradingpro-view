<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Proyecto: TradingPro View

**Ubicación:** `C:\TradingProView\`

## Dev server - IMPORTANTE

El dev server de Next.js corre como proceso local y **muere cuando se cierra la shell** que lo lanzó.
Cada sesión nueva de opencode arranca sin procesos en background heredados, por lo que
`http://localhost:3000` puede NO responder al iniciar una sesión.

### Cómo levantarlo (no volver a preguntar al usuario)

Ejecutar en PowerShell (NUNCA suponer que ya está corriendo):

```powershell
Start-Process -FilePath "powershell" -ArgumentList "-NoExit","-Command","Set-Location -LiteralPath 'C:\TradingProView'; npm run dev" -WindowStyle Normal
# Esperar ~15-18s y luego verificar con:
Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 8
```

Alternativa más limpia: `Start-Process "C:\TradingProView\start-dev.bat"`.

### Atajos disponibles en PowerShell del usuario

- `dev`        -> levanta el dev server en nueva ventana (alias definido en el profile)
- `kill-dev`   -> mata cualquier proceso node colgado en el puerto 3000
- `tvf`        -> `cd C:\TradingProView`

### Verificación rápida de estado

```powershell
Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
```

## Android / Capacitor - Stack instalado

- **JDK 21** en `C:\TradingProView\jdk21\` (Eclipse Temurin 21.0.11). JAVA_HOME persistido a nivel usuario.
- **Android SDK** en `C:\Users\Carlos Mundaray\AppData\Local\Android\Sdk`:
  - Platform 36 (compileSdk), build-tools 36.0.0
  - cmdline-tools (compatible JDK 17+)
  - platform-tools (ADB funcional)
- **Gradle 8.14.3** pre-cacheado en `~/.gradle/wrapper/dists/...`.
- **Keystore release** en `C:\Users\Carlos Mundaray\.android\tradingproview-release.jks`
  - alias: `tradingproview`
  - password: `tvf-release-2026`
  - valido 10000 dias

### Build del APK

```powershell
$env:JAVA_HOME = "C:\TradingProView\jdk21"
$env:Path      = "$env:JAVA_HOME\bin;$env:Path"
# Build web SIN basePath (Capacitor necesita raiz vacia, no GitHub Pages)
Remove-Item -LiteralPath "C:\TradingProView\out" -Recurse -Force -ErrorAction SilentlyContinue
npm run build
# Sync a la carpeta android
npx capacitor sync android
# Compilar APK release
.\android\gradlew -p "C:\TradingProView\android" assembleRelease --no-daemon
# Output: android\app\build\outputs\apk\release\app-release.apk
```

Para GitHub Pages el workflow .github/workflows/deploy.yml infiere el basePath
automaticamente desde `GITHUB_REPOSITORY##*/`.

## Repositorio Git

- Remoto: `https://github.com/carlosmundaray1/tradingpro-view`
- Branch: `main`
- URL publica GitHub Pages: `https://carlosmundaray1.github.io/tradingpro-view/`
