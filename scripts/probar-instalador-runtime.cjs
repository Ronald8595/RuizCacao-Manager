// Compila exclusivamente el include NSIS en un arnés temporal. No construye ni
// instala la aplicación; nunca ejecuta customInit ni el redistribuible en el host.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const cache = path.join(process.env.LOCALAPPDATA, 'electron-builder/Cache')
function buscar(base, nombre) {
  for (const entrada of fs.readdirSync(base, { withFileTypes: true })) {
    const file = path.join(base, entrada.name)
    if (
      entrada.isFile() &&
      entrada.name === nombre &&
      (nombre !== 'StdUtils.dll' || path.basename(base) === 'x86-unicode')
    )
      return file
    if (entrada.isDirectory()) {
      const found = buscar(file, nombre)
      if (found) return found
    }
  }
}
const compiler = buscar(path.join(cache, 'nsis-3.0.4.1'), 'makensis.exe')
const plugin = buscar(path.join(cache, 'nsis-resources-3.4.1'), 'StdUtils.dll')
if (!compiler || !plugin || !plugin.includes('x86-unicode'))
  throw Error('Falta el compilador/plugin Unicode ya utilizados por electron-builder.')
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'rcm-nsis-runtime-'))
const outfile = path.join(carpeta, 'prueba.exe')
const include = path.join(root, 'node_modules/app-builder-lib/templates/nsis/include')
const casos = [
  [0, 'v14.51.36247.0', 0],
  [1, '', 0],
  [1, 'v14.0.0.0', 0],
  [1, 'v14.51.36247.0', 1],
  [1, '14.51.36247.0', 1],
  [1, 'v14.99.1.0', 1]
]
let pruebas = ''
casos.forEach(([instalado, version, esperado], i) => {
  pruebas += `StrCpy $RuizRuntimeReady 0\nStrCpy $0 ${instalado}\nStrCpy $RuizRuntimeVersion "${version}"\nCall RuizCompareRuntime\nStrCmp $RuizRuntimeReady ${esperado} caso_${i}_ok\nSetErrorLevel ${40 + i}\nQuit\ncaso_${i}_ok:\n`
})
const script = `Unicode true
Name "Prueba aislada del include NSIS"
OutFile "${outfile}"
RequestExecutionLevel user
SilentInstall silent
!addincludedir "${include}"
!addplugindir /x86-unicode "${path.dirname(plugin)}"
!include "StdUtils.nsh"
!define BUILD_RESOURCES_DIR "${path.join(root, 'build')}"
!include "${path.join(root, 'build/installer.nsh')}"
; Compilar el flujo real, pero NO llamarlo: no hay UAC, runtime ni instalación.
Function SoloCompilarPrerequisito
!insertmacro customInit
FunctionEnd
Function .onInit
${pruebas}
SetErrorLevel 0
Quit
FunctionEnd
Section
SectionEnd
`
const file = path.join(carpeta, 'prueba.nsi')
fs.writeFileSync(file, script, 'utf8')
execFileSync(compiler, ['-INPUTCHARSET', 'UTF8', file], {
  windowsHide: true,
  stdio: 'inherit',
  timeout: 120000
})
execFileSync(outfile, ['/S'], { windowsHide: true, timeout: 10000 })
// Comprobar que el mismo include se acepta al generar el desinstalador.
fs.writeFileSync(
  file,
  script
    .replace(
      '!include "' + path.join(root, 'build/installer.nsh') + '"',
      '!define BUILD_UNINSTALLER\n!include "' + path.join(root, 'build/installer.nsh') + '"'
    )
    .replace(/Function SoloCompilarPrerequisito[\s\S]*?FunctionEnd/, '')
    .replace(pruebas, ''),
  'utf8'
)
execFileSync(compiler, ['-INPUTCHARSET', 'UTF8', file], {
  windowsHide: true,
  stdio: 'inherit',
  timeout: 120000
})
console.log(
  'OK: include instalador/desinstalador compilado; runtime ausente/antiguo/igual/posterior comparado sin instalar VC++. Artefactos: ' +
    carpeta
)
