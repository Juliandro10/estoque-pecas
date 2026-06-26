@echo off
title Parar Estoque de Pecas
cd /d "%~dp0"

echo Encerrando servico local (portas 3847/3848 e scanner)...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:3848" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "127.0.0.1:3847" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kill-scanner.ps1"

echo Pronto. Se ainda houver processos node, feche pelo Gerenciador de Tarefas.
timeout /t 3 /nobreak >nul
