@echo off
REM ============================================================
REM  TradingPro View - Kill dev server
REM  Mata cualquier proceso node de Next.js que haya quedado
REM  colgado en el puerto 3000.
REM  Uso: doble-click, o escribir 'kill-dev' en la terminal
REM ============================================================

echo [TradingPro View] Buscando procesos en el puerto 3000 ...

REM Mata procesos node que escuchan en 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Matando PID %%a ...
    taskkill /F /PID %%a
)

echo.
echo [TradingPro View] Listo. Ya podes volver a levantar con 'dev'.
pause
