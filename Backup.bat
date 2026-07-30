@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "logs\" mkdir "logs"
set "LOG=logs\backup.log"

>>"%LOG%" echo.
>>"%LOG%" echo [%date% %time%] ===== Backup Estoque de Pecas =====

if not exist "node_modules\" (
  >>"%LOG%" echo [%date% %time%] Instalando dependencias...
  call npm install >>"%LOG%" 2>&1
  if errorlevel 1 (
    >>"%LOG%" echo [%date% %time%] ERRO: npm install falhou.
    exit /b 1
  )
)

>>"%LOG%" echo [%date% %time%] Executando npm run backup...
call npm run backup >>"%LOG%" 2>&1
set "RC=%errorlevel%"

if %RC% equ 0 (
  >>"%LOG%" echo [%date% %time%] Backup concluido com sucesso.
) else (
  >>"%LOG%" echo [%date% %time%] ERRO no backup (codigo %RC%).
)

exit /b %RC%
