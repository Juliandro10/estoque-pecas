$projectRoot = Split-Path $PSScriptRoot -Parent
$batPath = Join-Path $projectRoot "Iniciar.bat"
$startup = [Environment]::GetFolderPath("Startup")
$desktop = [Environment]::GetFolderPath("Desktop")
$shell = New-Object -ComObject WScript.Shell

function New-Shortcut($targetDir, $name) {
  $lnk = Join-Path $targetDir "$name.lnk"
  $sc = $shell.CreateShortcut($lnk)
  $sc.TargetPath = $batPath
  $sc.WorkingDirectory = $projectRoot
  $sc.WindowStyle = 7
  $sc.Description = "Estoque de pecas - painel local"
  $sc.Save()
  Write-Host "Criado: $lnk"
}

New-Shortcut $desktop "Estoque de Pecas"
New-Shortcut $startup "Estoque de Pecas"

Write-Host ""
Write-Host "Pronto. O painel abrira sozinho quando voce ligar o PC."
Write-Host "Para desativar: apague o atalho em Iniciar > Programas > Inicializar"
