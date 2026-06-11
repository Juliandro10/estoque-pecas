Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -like '*programs-scanner*' -or
    ($_.CommandLine -like '*Estoque de Pe*as*' -and $_.CommandLine -like '*concurrently*') -or
    ($_.CommandLine -like '*Estoque de Pe*as*' -and $_.CommandLine -like '*tsx*watch*')
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
