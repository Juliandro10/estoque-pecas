# Registra backup diário no Agendador do Windows.
# Executar: clique direito -> Executar com PowerShell (na pasta scripts ou raiz do projeto).

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$bat = Join-Path $projectRoot 'Backup.bat'
$taskName = 'Estoque de Pecas - Backup Diario'

if (-not (Test-Path -LiteralPath $bat)) {
  Write-Error "Arquivo nao encontrado: $bat"
}

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute $bat -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At '02:00'

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Backup diario do Estoque de Pecas (Firestore + data/). Saida em backups/.' `
  -RunLevel Limited | Out-Null

Write-Host ""
Write-Host "Tarefa registrada: $taskName"
Write-Host "  Horario: todo dia as 02:00"
Write-Host "  Script: $bat"
Write-Host "  Saida: $projectRoot\backups\"
Write-Host "  Log: $projectRoot\logs\backup.log"
Write-Host ""
Write-Host "Para testar agora: .\Backup.bat"
Write-Host "Para remover: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
