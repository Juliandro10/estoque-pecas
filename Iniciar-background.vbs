Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("Wscript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
bat = dir & "\Iniciar-servico.bat"
sh.Run "cmd /c """ & bat & """", 0, False
