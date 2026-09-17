# Registra tarefa no Agendador do Windows para subir o servico local ao logon (sem janela).
# Executar: clique direito -> Executar com PowerShell (ou terminal na pasta do projeto).

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$vbs = Join-Path $projectRoot 'Iniciar-background.vbs'
$taskName = 'Estoque de Pecas - Servico Local'

if (-not (Test-Path -LiteralPath $vbs)) {
  Write-Error "Arquivo nao encontrado: $vbs"
}

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$trigger.Delay = 'PT30S'

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 2) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Sobe Vite + scanner de programacao/cadastro (Estoque de Pecas) em segundo plano.' `
  -RunLevel Limited | Out-Null

Write-Host ""
Write-Host "Tarefa registrada: $taskName"
Write-Host "  Dispara: ao fazer logon ($env:USERNAME), com atraso de 30s"
Write-Host "  Log:     $projectRoot\logs\vigia.log"
Write-Host ""
Write-Host "Para testar agora: Abra 'Agendador de Tarefas' -> clique direito na tarefa -> Executar"
Write-Host "Para remover:      .\scripts\remover-inicio-automatico.ps1"
Write-Host ""
