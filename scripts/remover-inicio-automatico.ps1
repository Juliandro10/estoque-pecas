# Remove a tarefa de inicio automatico do Agendador do Windows.

$ErrorActionPreference = 'Stop'
$taskName = 'Estoque de Pecas - Servico Local'

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $existing) {
  Write-Host "Tarefa nao encontrada: $taskName"
  exit 0
}

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Write-Host "Tarefa removida: $taskName"
