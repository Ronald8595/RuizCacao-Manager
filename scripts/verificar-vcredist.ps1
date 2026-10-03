param([Parameter(Mandatory = $true)][string]$RuntimeFile, [switch]$Download)
$ErrorActionPreference = 'Stop'
# Evitar módulos de PowerShell 7 heredados por Node al usar Windows PowerShell 5.
Import-Module "$PSHOME\Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1"
Import-Module "$PSHOME\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1"
if ($Download) {
  # Solo preparación técnica del instalador. La aplicación y NSIS nunca descargan.
  Invoke-WebRequest -Uri 'https://aka.ms/vc14/vc_redist.x64.exe' -OutFile $RuntimeFile
}
$runtimeSignature = Get-AuthenticodeSignature -LiteralPath $RuntimeFile
if ($runtimeSignature.Status -ne 'Valid' -or
    $runtimeSignature.SignerCertificate.Subject -notmatch '(^|, )CN=Microsoft Corporation(,|$)') {
  throw 'El redistribuible debe tener una firma válida de Microsoft Corporation.'
}
$runtimeInfo = (Get-Item -LiteralPath $RuntimeFile).VersionInfo
if ($runtimeInfo.FileDescription -notmatch 'Microsoft Visual C\+\+.*\(x64\)') {
  throw 'El redistribuible debe ser Microsoft Visual C++ x64.'
}
[pscustomobject]@{
  version = $runtimeInfo.FileVersion
  sha256 = (Get-FileHash -LiteralPath $RuntimeFile -Algorithm SHA256).Hash.ToLowerInvariant()
  publisher = 'Microsoft Corporation'
} | ConvertTo-Json -Compress
