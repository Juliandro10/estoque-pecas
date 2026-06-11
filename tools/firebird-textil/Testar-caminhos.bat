@echo off
setlocal
set ISQL=%~dp0bin32\isql.exe
set USER=%1
set PASS=%2
if "%USER%"=="" set USER=Juliandro
if "%PASS%"=="" set PASS=masterkey

echo Testando conexoes Firebird (usuario %USER%)...
echo.

for %%P in (
  "192.168.1.69/3050:TEXTIL"
  "192.168.1.69/3050:textil"
  "192.168.1.69/3050:C:\Textil\TEXTIL.FDB"
  "192.168.1.69/3050:C:\Sistemas\Textil\TEXTIL.FDB"
  "192.168.1.69/3050:D:\Textil\TEXTIL.FDB"
  "192.168.1.69/3050:C:\Firebird\Data\TEXTIL.FDB"
  "192.168.1.69/3050:C:\Program Files\Firebird\Firebird_2_5\DATA\TEXTIL.FDB"
) do (
  echo === %%~P ===
  (echo quit;)| "%ISQL%" %%~P -user %USER% -password %PASS% 2>&1
  echo.
)

pause
