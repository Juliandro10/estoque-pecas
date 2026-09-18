@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "logs\" mkdir "logs"
set "LOG=logs\servico.log"

>>"%LOG%" echo.
>>"%LOG%" echo [%date% %time%] ===== Iniciando servico (segundo plano) =====

set "NODEEXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODEEXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODEEXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODEEXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODEEXE for /f "delims=" %%i in ('where node 2^>nul') do (
  if not defined NODEEXE set "NODEEXE=%%i"
)

if not defined NODEEXE (
  >>"%LOG%" echo [%date% %time%] ERRO: Node.js nao encontrado.
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  >>"%LOG%" echo [%date% %time%] Instalando dependencias...
  if exist "%ProgramFiles%\nodejs\npm.cmd" (
    call "%ProgramFiles%\nodejs\npm.cmd" install >>"%LOG%" 2>&1
  ) else (
    call npm install >>"%LOG%" 2>&1
  )
  if errorlevel 1 (
    >>"%LOG%" echo [%date% %time%] ERRO: npm install falhou.
    exit /b 1
  )
)

>>"%LOG%" echo [%date% %time%] Vigia com "%NODEEXE%". Log: logs\vigia.log
"%NODEEXE%" scripts\keep-local-service.mjs >>"%LOG%" 2>&1
exit /b %errorlevel%
