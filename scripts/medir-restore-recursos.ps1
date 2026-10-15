param([int]$MainPid, [string]$Raiz, [string]$Salida, [string]$Parada, [string]$Fase)
$ErrorActionPreference = 'Stop'
# Solo arnés opt-in. Nunca se importa ni ejecuta desde el producto.
while (-not (Test-Path -LiteralPath $Parada)) {
  $muestras = @()
  $contexto = @{ caso = 'fuera_medicion'; fase = '' }
  try { $contexto = Get-Content -LiteralPath $Fase -Raw | ConvertFrom-Json } catch {}
  $procesos = @(Get-CimInstance Win32_Process -Filter "Name='postgres.exe' OR Name='pg_dump.exe' OR Name='pg_restore.exe'")
  $propios = [System.Collections.Generic.HashSet[int]]::new()
  $raizNormalizada = $Raiz.Replace('\','/').ToLowerInvariant()
  foreach ($p in $procesos) { if ($p.CommandLine -and $p.CommandLine.Replace('\','/').ToLowerInvariant().Contains($raizNormalizada)) { [void]$propios.Add([int]$p.ProcessId) } }
  do {
    $agregado = $false
    foreach ($p in $procesos) { if ($propios.Contains([int]$p.ParentProcessId) -and $propios.Add([int]$p.ProcessId)) { $agregado = $true } }
  } while ($agregado)
  $ids = @($MainPid) + @($propios)
  foreach ($numero in $ids) {
    try {
      $p = Get-Process -Id $numero -ErrorAction Stop
      $muestras += @{ pid = $numero; nombre = $p.ProcessName; working_set = $p.WorkingSet64; peak_working_set = $p.PeakWorkingSet64; cpu_ms = $p.TotalProcessorTime.TotalMilliseconds }
    } catch { # El proceso puede terminar entre inventario y muestra.
    }
  }
  @{ fecha = [DateTime]::UtcNow.ToString('o'); caso = $contexto.caso; fase = $contexto.fase; procesos = $muestras } | ConvertTo-Json -Depth 5 -Compress | Add-Content -LiteralPath $Salida -Encoding utf8
  Start-Sleep -Milliseconds 250
}
