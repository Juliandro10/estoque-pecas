@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "logs\" mkdir "logs"
set "LOG=logs\servico.log"

>>"%LOG%" echo.
>>"%LOG%" echo [%date% %time%] ===== Iniciando servico (segundo plano) =====

if not exist "node_modules\" (
  >>"%LOG%" echo [%date% %time%] Instalando dependencias...
  call npm install >>"%LOG%" 2>&1
  if errorlevel 1 (
    >>"%LOG%" echo [%date% %time%] ERRO: npm install falhou.
    exit /b 1
  )
)

>>"%LOG%" echo [%date% %time%] Vigia Vite + scanner (religa se cair). Log: logs\vigia.log
node scripts\keep-local-service.mjs
exit /b %errorlevel%
