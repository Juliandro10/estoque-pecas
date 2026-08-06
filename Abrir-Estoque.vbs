Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
Set http = CreateObject("MSXML2.XMLHTTP")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
url = "http://127.0.0.1:3847/"
bat = dir & "\Iniciar-servico.bat"

Function IsUp()
  On Error Resume Next
  http.Open "GET", url, False
  http.Send
  IsUp = (Err.Number = 0 And http.Status >= 200 And http.Status < 500)
  Err.Clear
  On Error GoTo 0
End Function

If Not IsUp() Then
  sh.Run "cmd /c """ & bat & """", 0, False
  Dim i
  For i = 1 To 40
    WScript.Sleep 500
    If IsUp() Then Exit For
  Next
End If

sh.Run url
