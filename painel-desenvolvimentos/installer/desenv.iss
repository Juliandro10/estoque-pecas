#define AppName "Painel Desenvolvimentos"
#define AppVersion "1.1.0"
#define AppPublisher "Stoll"

[Setup]
AppId={{C9D1A4F2-8B36-4E70-A1C5-3D7E9F0B2A84}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName=C:\Painel Desenvolvimentos
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=..\..\dist
OutputBaseFilename=Painel-Desenvolvimentos-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
SetupIconFile=
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\PainelDesenvolvimentos.exe
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0
LanguageDetectionMethod=locale

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "payload\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autodesktop}\Desenvolvimentos"; Filename: "{app}\PainelDesenvolvimentos.exe"; WorkingDir: "{app}"
Name: "{group}\Desenvolvimentos"; Filename: "{app}\PainelDesenvolvimentos.exe"; WorkingDir: "{app}"
Name: "{userstartup}\Desenvolvimentos"; Filename: "{app}\PainelDesenvolvimentos.exe"; WorkingDir: "{app}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Painel Desenvolvimentos"; ValueData: """{app}\PainelDesenvolvimentos.exe"""; Flags: uninsdeletevalue

[Run]
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""Painel Desenvolvimentos"""; Flags: runhidden; StatusMsg: "Liberando a rede..."
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""Painel Desenvolvimentos"" dir=in action=allow protocol=TCP localport=3851 profile=private,domain"; Flags: runhidden
Filename: "{app}\PainelDesenvolvimentos.exe"; Description: "Abrir Desenvolvimentos agora"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill"; Parameters: "/IM PainelDesenvolvimentos.exe /F"; Flags: runhidden; RunOnceId: "KillDesenv"
Filename: "taskkill"; Parameters: "/IM desenv-node.exe /F"; Flags: runhidden; RunOnceId: "KillDesenvNode"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/IM PainelDesenvolvimentos.exe /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/IM desenv-node.exe /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;
