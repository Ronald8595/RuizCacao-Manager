param([string]$ReadyFile, [string]$StopFile, [string]$OutputFile)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class ConsolasPgctl {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc fn, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder c, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  public static string[] Visible() {
    var result = new List<string>();
    EnumWindows((h,p) => {
      if (IsWindowVisible(h)) {
        var c = new StringBuilder(256); GetClassName(h,c,256);
        if (c.ToString() == "ConsoleWindowClass" || c.ToString() == "CASCADIA_HOSTING_WINDOW_CLASS") {
          uint id; GetWindowThreadProcessId(h,out id);
          result.Add(h.ToString()+":"+id+":"+c.ToString());
        }
      }
      return true;
    }, IntPtr.Zero);
    return result.ToArray();
  }
}
'@
$iniciales = @([ConsolasPgctl]::Visible())
$nuevas = [System.Collections.Generic.HashSet[string]]::new()
$muestras = 0
Set-Content -LiteralPath $ReadyFile -Value 'ready'
while (-not (Test-Path -LiteralPath $StopFile)) {
  foreach ($c in [ConsolasPgctl]::Visible()) {
    if ($iniciales -notcontains $c) { [void]$nuevas.Add($c) }
  }
  $muestras++
  Start-Sleep -Milliseconds 20
}
@{ intervaloMs=20; muestras=$muestras; nuevasConsolas=@($nuevas); limite='No detecta destellos inferiores al muestreo; no lee títulos ni contenido de ventanas.' } | ConvertTo-Json | Set-Content -LiteralPath $OutputFile -Encoding utf8
