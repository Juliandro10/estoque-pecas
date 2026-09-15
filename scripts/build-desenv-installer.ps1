$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$installer = Join-Path $root "painel-desenvolvimentos\installer"
$payload = Join-Path $installer "payload"
$cache = Join-Path $installer ".cache"
$tecelagemCache = Join-Path $root "painel-tecelagem\installer\.cache"
$tecelagemPayload = Join-Path $root "painel-tecelagem\installer\payload"
$dist = Join-Path $root "dist"
$nodeVersion = "22.19.0"
$nodeZipName = "node-v$nodeVersion-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/v$nodeVersion/$nodeZipName"

New-Item -ItemType Directory -Force -Path $payload, $cache, $dist | Out-Null

Write-Host "Empacotando o servidor..."
Push-Location $root
try {
  npx --yes esbuild "painel-desenvolvimentos/server.ts" --bundle --platform=node --format=cjs --banner:js="const import_meta_url = require('url').pathToFileURL(__filename).href;" --define:import.meta.url=import_meta_url --outfile="$payload/server.cjs"
  if ($LASTEXITCODE -ne 0) { throw "esbuild falhou" }
} finally {
  Pop-Location
}

$publicSrc = Join-Path $root "painel-desenvolvimentos\public"
$publicDst = Join-Path $payload "public"
if (Test-Path $publicDst) { Remove-Item -Recurse -Force $publicDst }
Copy-Item -Recurse -Force $publicSrc $publicDst

$envFile = Join-Path $root ".env"
$apiKey = ""
$projectId = "controle-tricot-e-cia"
$authDomain = "controle-tricot-e-cia.firebaseapp.com"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*VITE_FIREBASE_API_KEY=(.*)$') { $apiKey = $Matches[1].Trim() }
    if ($_ -match '^\s*VITE_FIREBASE_PROJECT_ID=(.*)$') { $projectId = $Matches[1].Trim() }
    if ($_ -match '^\s*VITE_FIREBASE_AUTH_DOMAIN=(.*)$') { $authDomain = $Matches[1].Trim() }
  }
}
if (-not $authDomain) { $authDomain = "$projectId.firebaseapp.com" }
$cfg = @{ projectId = $projectId; apiKey = $apiKey; authDomain = $authDomain } | ConvertTo-Json -Compress
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $publicDst "firebase-config.js"), "window.DESENV_FIREBASE = $cfg;", $utf8)
[System.IO.File]::WriteAllText((Join-Path $payload "firebase-web.json"), (@{ projectId = $projectId; apiKey = $apiKey } | ConvertTo-Json), $utf8)

$envKeys = @(
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "SYNTECH_FB_HOST",
  "SYNTECH_FB_PORT",
  "SYNTECH_FB_DATABASE",
  "SYNTECH_FB_USER",
  "SYNTECH_FB_PASSWORD",
  "DESENV_FIREBASE_EMAIL",
  "DESENV_FIREBASE_PASSWORD"
)
$envMap = @{}
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') {
      $k = $Matches[1].Trim()
      if ($envKeys -contains $k) { $envMap[$k] = $Matches[2].Trim() }
    }
  }
}
if (-not $envMap.ContainsKey("SYNTECH_FB_HOST")) { $envMap["SYNTECH_FB_HOST"] = "192.168.1.52" }
if (-not $envMap.ContainsKey("SYNTECH_FB_PORT")) { $envMap["SYNTECH_FB_PORT"] = "3050" }
if (-not $envMap.ContainsKey("SYNTECH_FB_DATABASE")) { $envMap["SYNTECH_FB_DATABASE"] = "C:\Textil\Empresas\FABRICA.MDB" }
$envLines = foreach ($k in $envKeys) {
  if ($envMap.ContainsKey($k) -and $envMap[$k]) { "$k=$($envMap[$k])" }
}
[System.IO.File]::WriteAllLines((Join-Path $payload ".env"), $envLines, $utf8)

$setorAuth = Join-Path $root "painel-desenvolvimentos\.setor-auth.json"
if (Test-Path $setorAuth) {
  Copy-Item -Force $setorAuth (Join-Path $payload ".setor-auth.json")
}

Copy-Item -Force (Join-Path $root "tools\firebird-textil\bin64\fbclient.dll") $payload
Copy-Item -Force (Join-Path $root "tools\firebird-textil\bin64\gds32.dll") $payload
$fbMsg = Join-Path $root "tools\firebird-textil\fb64\firebird.msg"
if (Test-Path $fbMsg) { Copy-Item -Force $fbMsg $payload }

Copy-Item -Force (Join-Path $installer "LEIA-ME.txt") (Join-Path $payload "LEIA-ME.txt")

function Find-NodeZip {
  $paths = @(
    (Join-Path $cache $nodeZipName),
    (Join-Path $tecelagemCache $nodeZipName)
  )
  foreach ($p in $paths) { if (Test-Path $p) { return $p } }
  return $null
}

$nodeDst = Join-Path $payload "desenv-node.exe"
if (-not (Test-Path $nodeDst)) {
  $fromTecelagem = Join-Path $tecelagemPayload "painel-node.exe"
  if (Test-Path $fromTecelagem) {
    Copy-Item -Force $fromTecelagem $nodeDst
  } else {
    $nodeZip = Find-NodeZip
    if (-not $nodeZip) {
      Write-Host "Baixando Node.js portatil..."
      $nodeZip = Join-Path $cache $nodeZipName
      Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip
    }
    $extract = Join-Path $cache "node-extract"
    if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
    Expand-Archive -Path $nodeZip -DestinationPath $extract -Force
    $nodeExe = Get-ChildItem $extract -Recurse -Filter node.exe | Select-Object -First 1
    if (-not $nodeExe) { throw "node.exe nao encontrado no zip" }
    Copy-Item -Force $nodeExe.FullName $nodeDst
  }
}

Write-Host "Compilando o programa..."
$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { throw "Compilador .NET nao encontrado no Windows." }
& $csc /nologo /target:winexe /optimize /out:"$payload\PainelDesenvolvimentos.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll /codepage:65001 "$installer\Launcher.cs"
if ($LASTEXITCODE -ne 0) { throw "Falha ao gerar PainelDesenvolvimentos.exe" }

function Find-Iscc {
  $paths = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 7\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 7\ISCC.exe",
    (Join-Path $tecelagemCache "inno\ISCC.exe"),
    (Join-Path $cache "inno\ISCC.exe")
  )
  foreach ($p in $paths) { if (Test-Path $p) { return $p } }
  return $null
}

$iscc = Find-Iscc
if (-not $iscc) {
  Write-Host "Baixando o montador do instalador..."
  $innoDir = Join-Path $cache "inno"
  New-Item -ItemType Directory -Force -Path $innoDir | Out-Null
  $innoDl = Join-Path $cache "inno-download"
  if (Test-Path $innoDl) { Remove-Item -Recurse -Force $innoDl }
  New-Item -ItemType Directory -Force -Path $innoDl | Out-Null
  winget download --id JRSoftware.InnoSetup -e --accept-package-agreements --accept-source-agreements --disable-interactivity --download-directory $innoDl
  $innoSetup = Get-ChildItem $innoDl -Recurse -Include *.exe | Select-Object -First 1
  if (-not $innoSetup) { throw "Nao foi possivel baixar o Inno Setup." }
  Start-Process -FilePath $innoSetup.FullName -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/DIR=$innoDir" -Wait
  $iscc = Find-Iscc
}
if (-not $iscc) { throw "ISCC.exe nao encontrado. Instale o Inno Setup 6." }

Write-Host "Gerando Painel-Desenvolvimentos-Setup.exe..."
& $iscc /Q (Join-Path $installer "desenv.iss")
if ($LASTEXITCODE -ne 0) { throw "Inno Setup falhou" }

$setup = Join-Path $dist "Painel-Desenvolvimentos-Setup.exe"
if (-not (Test-Path $setup)) { throw "Instalador nao foi gerado." }
Copy-Item -Force (Join-Path $installer "LEIA-ME.txt") (Join-Path $dist "LEIA-ME-Painel-Desenvolvimentos.txt")
Write-Host ""
Write-Host "Pronto: $setup"
Write-Host "Leve esse arquivo no pen drive. No PC do cadastro, dois cliques e Proximo. Nao instala o Estoque de Pecas."
