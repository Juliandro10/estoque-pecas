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

>>"%LOG%" echo [%date% %time%] Liberando portas e processos antigos...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:3848" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:3847" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kill-scanner.ps1" >nul 2>&1
timeout /t 1 /nobreak >nul

>>"%LOG%" echo [%date% %time%] Subindo Vite + scanner em http://127.0.0.1:3847
call npm run dev:local >>"%LOG%" 2>&1

>>"%LOG%" echo [%date% %time%] Servico encerrado (codigo %errorlevel%).
exit /b %errorlevel%
