Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
url = "http://127.0.0.1:3847/"
bat = dir & "\Iniciar-servico.bat"

Function IsUp()
  On Error Resume Next
  Dim http, ok
  ok = False
  Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
  If Err.Number = 0 Then
    http.SetTimeouts 1200, 1200, 1200, 1200
    http.SetProxy 1
    http.Open "GET", url, False
    http.Send
    ok = (Err.Number = 0 And http.Status >= 200 And http.Status < 500)
  End If
  Err.Clear
  IsUp = ok
End Function

If Not IsUp() Then
  sh.Run "cmd /c """ & bat & """", 0, False
  Dim i
  For i = 1 To 40
    WScript.Sleep 400
    If IsUp() Then Exit For
  Next
End If

sh.Run url
