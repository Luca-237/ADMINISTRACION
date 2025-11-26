@echo off
title Sistema Web USB
color 0A

:: 1. Iniciar el servidor en segundo plano
start /B "" "%~dp0node.exe" "%~dp0server.js"

:: 2. Esperar 2 segundos a que el servidor arranque
timeout /t 2 /nobreak >nul

:: 3. Abrir el navegador en localhost
start http://localhost:3000

echo.
echo ==========================================
echo    SISTEMA CORRIENDO EN SEGUNDO PLANO
echo    No cierres esta ventana negra.
echo    Si cierras el navegador, puedes volver
echo    a entrar en http://localhost:3000
echo ==========================================
echo.
pause