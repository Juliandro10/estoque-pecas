@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "DB=192.168.1.69/3050:TEXTIL"
set "USER=Juliandro"

cd /d "%ROOT%bin32"

if not exist isql.exe (
  echo isql.exe nao encontrado em bin32
  pause
  exit /b 1
)

if "%TEXTIL_FB_PASSWORD%"=="" (
  echo.
  echo  Explorar banco TEXTIL ^(Syntech^) — somente leitura
  echo  Servidor: %DB%
  echo  Usuario:  %USER%
  echo.
  set /p "TEXTIL_FB_PASSWORD=Senha Firebird: "
)

echo.
echo --- Tabelas ^(SHOW TABLES^) ---
(
  echo SHOW TABLES;
  echo EXIT;
) | isql.exe "%DB%" -user "%USER%" -password "%TEXTIL_FB_PASSWORD%" -m -q

if errorlevel 1 (
  echo.
  echo Falhou. Confira senha e rede ^(RENATA 192.168.1.69:3050^).
  pause
  exit /b 1
)

echo.
echo Para console interativo:
echo   cd /d "%ROOT%bin32"
echo   isql.exe %DB% -user %USER%
echo.
pause
