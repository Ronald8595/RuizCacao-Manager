param([Parameter(Mandatory=$true)][string]$DataDirectory,
      [Parameter(Mandatory=$true)][string]$OutputFile,
      [Parameter(Mandatory=$true)][string]$StopFile)
$ErrorActionPreference = 'Stop'
$registros = [System.Collections.Generic.List[object]]::new()
try {
  while (-not (Test-Path -LiteralPath $StopFile)) {
    $instante = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $archivoPid = Join-Path $DataDirectory 'postmaster.pid'
    $filas = @()
    if (Test-Path -LiteralPath $archivoPid) {
      $lineas = Get-Content -LiteralPath $archivoPid
      if ($lineas.Count -gt 1 -and [IO.Path]::GetFullPath($lineas[1]) -eq [IO.Path]::GetFullPath($DataDirectory)) {
        $raizPg = [int]$lineas[0]
        $candidatos = @(Get-CimInstance Win32_Process -Filter "Name = 'postgres.exe'" | Select-Object ProcessId,ParentProcessId)
        $ids = [System.Collections.Generic.HashSet[int]]::new()
        [void]$ids.Add($raizPg)
        do {
          $anteriores = $ids.Count
          foreach ($p in $candidatos) { if ($ids.Contains([int]$p.ParentProcessId)) { [void]$ids.Add([int]$p.ProcessId) } }
        } while ($ids.Count -gt $anteriores)
        $filas = @(foreach ($p in $candidatos) {
          if ($ids.Contains([int]$p.ProcessId)) {
            $proceso = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
            if ($proceso) { @{ pid=$proceso.Id; workingSetBytes=$proceso.WorkingSet64; privateBytes=$proceso.PrivateMemorySize64; cpuMs=$proceso.TotalProcessorTime.TotalMilliseconds } }
          }
        })
      }
    }
    $registros.Add(@{epoch=$instante;procesos=$filas})
    Start-Sleep -Milliseconds 1000
  }
} finally {
  ConvertTo-Json -InputObject @($registros.ToArray()) -Depth 5 -Compress | Set-Content -LiteralPath $OutputFile -Encoding utf8
}
