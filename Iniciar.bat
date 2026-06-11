@echo off
title Estoque de Pecas
cd /d "%~dp0"

if not exist "node_modules\" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 goto erro
)

echo.
echo Liberando portas e scanner antigo...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:3848" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:3847" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kill-scanner.ps1" >nul 2>&1
timeout /t 1 /nobreak >nul

echo.
echo Estoque + Programacao em http://127.0.0.1:3847
echo Deixe esta janela aberta. Para parar, feche a janela ou pressione Ctrl+C.
echo.

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:3847"
call npm run dev:local
goto fim

:erro
echo.
echo Nao foi possivel iniciar. Verifique se o Node.js esta instalado.
pause

:fim
