@echo off
REM ============================================================
REM  TradingPro View - Dev Server launcher
REM  Levanta el dev server de Next.js en http://localhost:3000
REM  Uso:
REM    1) Doble-click sobre este archivo, o
REM    2) En PowerShell/CMD escribir:  dev
REM       (si agregas C:\TradingProView al PATH, ver instrucciones abajo)
REM ============================================================

setlocal
cd /d "C:\TradingProView"

REM Verifica que node_modules este instalado
if not exist "node_modules\next\package.json" (
    echo [TradingPro View] Faltan dependencias. Instalando...
    call npm install
)

echo.
echo [TradingPro View] Levantando dev server en http://localhost:3000 ...
echo [TradingPro View] Ctrl+C para detener. NO cierres esta ventana.
echo.

REM Pasa TODOS los argumentos extra a npm run dev
call npm run dev %*

endlocal
