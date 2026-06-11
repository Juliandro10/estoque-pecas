@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "TARGET=%~1"

if "%TARGET%"=="" (
  echo.
  echo  Corrigir DLL do FlameRobin ^(64 bits^)
  echo  ---------------------------------
  echo  1. Atalho do FlameRobin ^> botao direito ^> Abrir local do arquivo
  echo  2. Copie o caminho da pasta e cole abaixo ^(ou arraste flamerobin.exe aqui^)
  echo.
  set /p "TARGET=Caminho da pasta do flamerobin.exe: "
)

if exist "%TARGET%\flamerobin.exe" (
  set "FRDIR=%TARGET%"
) else if /i "%~x1"==".exe" (
  set "FRDIR=%~dp1"
) else if exist "%TARGET%" (
  if exist "%TARGET%\flamerobin.exe" (
    set "FRDIR=%TARGET%"
  ) else (
    echo Pasta invalida: nao achei flamerobin.exe em "%TARGET%"
    pause
    exit /b 1
  )
) else (
  echo Pasta invalida: "%TARGET%"
  pause
  exit /b 1
)

echo.
echo Copiando DLLs 64-bit para:
echo   %FRDIR%
echo.

copy /Y "%ROOT%bin64\fbclient.dll" "%FRDIR%\" >nul
copy /Y "%ROOT%bin64\gds32.dll" "%FRDIR%\" >nul
if exist "%ROOT%fb64\firebird.msg" copy /Y "%ROOT%fb64\firebird.msg" "%FRDIR%\" >nul

if errorlevel 1 (
  echo Falhou. Execute como Administrador ou verifique o caminho.
  pause
  exit /b 1
)

echo OK — fbclient.dll e gds32.dll copiados.
echo Feche o FlameRobin, abra de novo e clique duplo em TEXTIL.
echo.
echo Se ainda falhar, copie tambem da pasta bin32 ^(FlameRobin 32 bits^):
echo   copy "%ROOT%bin32\fbclient.dll" "%FRDIR%\"
echo   copy "%ROOT%bin32\gds32.dll" "%FRDIR%\"
echo.
pause
