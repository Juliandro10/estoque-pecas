@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = New-Object -ComObject WScript.Shell; $d = [Environment]::GetFolderPath('Desktop'); $lnk = Join-Path $d 'Tricot e Cia.lnk'; $sc = $s.CreateShortcut($lnk); $exe = Join-Path (Get-Location) 'Atalhos-Tricot.exe'; $hta = Join-Path (Get-Location) 'Atalhos-Tricot.hta'; $sc.TargetPath = $(if (Test-Path $exe) { $exe } else { $hta }); $sc.WorkingDirectory = (Get-Location).Path; $sc.WindowStyle = 1; $sc.Description = 'Atalhos Tricot e Cia'; $sc.Save(); Write-Host $lnk"
echo.
echo Atalho "Tricot e Cia" na area de trabalho.
if exist "%~dp0Atalhos-Tricot.exe" (
  start "" "%~dp0Atalhos-Tricot.exe"
) else (
  start "" "%~dp0Atalhos-Tricot.hta"
)
pause
