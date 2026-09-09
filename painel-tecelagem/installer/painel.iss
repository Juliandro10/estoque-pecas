#define AppName "Painel Tecelagem"
#define AppVersion "1.0.0"
#define AppPublisher "Stoll"

[Setup]
AppId={{8F3C2A91-6E14-4B77-9D2C-7A1B4E9F3C21}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName=C:\Painel Tecelagem
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=..\..\dist
OutputBaseFilename=Painel-Tecelagem-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
SetupIconFile=
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\PainelTecelagem.exe
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0
LanguageDetectionMethod=locale

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "payload\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autodesktop}\Painel Tecelagem"; Filename: "{app}\PainelTecelagem.exe"; WorkingDir: "{app}"
Name: "{group}\Painel Tecelagem"; Filename: "{app}\PainelTecelagem.exe"; WorkingDir: "{app}"
Name: "{userstartup}\Painel Tecelagem"; Filename: "{app}\PainelTecelagem.exe"; WorkingDir: "{app}"

[Run]
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""Painel Tecelagem"""; Flags: runhidden; StatusMsg: "Liberando a rede..."
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""Painel Tecelagem"" dir=in action=allow protocol=TCP localport=3850 profile=private,domain"; Flags: runhidden
Filename: "{app}\PainelTecelagem.exe"; Description: "Abrir o Painel Tecelagem agora"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill"; Parameters: "/IM PainelTecelagem.exe /F"; Flags: runhidden; RunOnceId: "KillPainel"
Filename: "taskkill"; Parameters: "/IM painel-node.exe /F"; Flags: runhidden; RunOnceId: "KillPainelNode"

[Code]
function InitializeUninstall(): Boolean;
begin
  Result := True;
end;
