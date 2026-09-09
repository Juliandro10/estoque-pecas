@echo off
title Painel Tecelagem
cd /d "%~dp0.."

if not exist "node_modules\" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 goto erro
)

echo.
echo Painel da tecelagem — sem Estoque de Pecas
echo Deixe esta janela aberta. TV e outros PCs usam o endereco que aparecer abaixo.
echo.

timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:3850"
call npx tsx painel-tecelagem/server.ts
goto fim

:erro
echo.
echo Nao foi possivel iniciar. Verifique se o Node.js esta instalado.
pause

:fim
