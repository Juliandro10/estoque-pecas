@echo off
title Estoque de Pecas
cd /d "%~dp0"

if not exist "node_modules\" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 goto erro
)

if not exist "dist\index.html" (
  echo Compilando painel pela primeira vez...
  call npm run build
  if errorlevel 1 goto erro
)

echo.
echo Estoque rodando em http://127.0.0.1:3847
echo Deixe esta janela aberta. Para parar, feche a janela ou pressione Ctrl+C.
echo.

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:3847"
call npm start
goto fim

:erro
echo.
echo Nao foi possivel iniciar. Verifique se o Node.js esta instalado.
pause

:fim
