@echo off
chcp 65001 >nul
echo.
echo  Descobrir caminho REAL do banco Syntech
echo  =====================================
echo.
echo  O nome TEXTIL no Sys_Info.INI NAO e alias Firebird.
echo  Por isso todos os caminhos que testamos falharam igual.
echo.
echo  Faca isto no PC onde o SYNTech ABRE e FUNCIONA:
echo.
echo  1) Win+R  ^>  odbcad32  ^>  Enter
echo  2) Aba "DSN do Sistema" / "System DSN"
echo  3) Procure algo como Textil, Firebird, Syntech, Fabrica
echo  4) Clique ^> Configurar ^> anote Servidor e Caminho do banco
echo.
echo  OU:
echo  5) Abra: C:\Program Files\Common Files\Borland Shared\BDE\IDAPI32.CFG
echo     (Bloco de Notas) — procure TEXTIL ou .FDB
echo.
echo  Me mande print ou copie a linha com .fdb
echo.
echo  No FlameRobin depois:
echo    Server: RENATA (192.168.1.69:3050)
echo    Database path: SOMENTE o caminho .FDB do servidor
echo      exemplo: D:\Dados\Syntech\TEXTIL.FDB
echo    (nao coloque 192.168.1.69 de novo no path)
echo.
start odbcad32.exe 2>nul
pause
