@echo off
chcp 65001 >nul
echo.
echo  Ajuste da conexao TEXTIL no FlameRobin
echo  =====================================
echo.
echo  1. FlameRobin ^> botao direito em TEXTIL ^> Properties / Propriedades
echo  2. Database path — apague tudo e cole EXATAMENTE:
echo.
echo     192.168.1.69/3050:TEXTIL
echo.
echo  3. User: Juliandro   ^|   Senha: a mesma de antes
echo  4. Save ^> duplo clique em TEXTIL
echo.
echo  Se ainda der "unavailable database", teste nesta ordem:
echo     192.168.1.69/3050:C:\Textil\TEXTIL.FDB
echo     192.168.1.69/3050:C:\Sistemas\Textil\TEXTIL.FDB
echo     192.168.1.69/3050:D:\Textil\TEXTIL.FDB
echo.
echo  Copie tambem firebird.msg para a pasta FlameRobin ^(x64^):
echo     de: tools\firebird-textil\fb64\firebird.msg
echo     para: C:\Program Files\FlameRobin ^(x64^)\
echo.
pause
