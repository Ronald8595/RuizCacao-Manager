const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const yaml = require('js-yaml')
const { verificar } = require('../scripts/preparar-vcredist.cjs')
const { getWindowsInstallationDirName } = require('app-builder-lib/out/targets/targetUtil')
const { AppInfo } = require('app-builder-lib/out/appInfo')
const root = path.resolve(__dirname, '..')
const config = yaml.load(fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'))
const anterior = yaml.load(
  fs.readFileSync(path.join(root, 'dist/builder-effective-config.yaml'), 'utf8')
)
assert.equal(config.appId, anterior.appId)
assert.equal(config.appId, 'com.gruporuiz.ruizcacao-manager')
assert.equal(config.productName, anterior.productName)
assert.equal(config.win.executableName, anterior.win.executableName)
assert.equal(require('../package.json').name, 'electron-app')
const metadata = new AppInfo(
  { metadata: require('../package.json'), config },
  undefined,
  config.win
)
assert.equal(getWindowsInstallationDirName(metadata, false), 'electron-app')
assert.equal(getWindowsInstallationDirName(metadata, !config.nsis.oneClick), 'RuizCacaoManager')
assert.equal(config.nsis.deleteAppDataOnUninstall, false)
assert.equal(config.nsis.perMachine, false)
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'rcm-distribucion-'))
const archivo = path.join(carpeta, 'runtime-no-aprobado.exe')
fs.writeFileSync(archivo, 'Este contenido no es el redistribuible firmado y aprobado.')
assert.throws(() => verificar(archivo), /SHA-256 aprobado/)
assert.throws(() => verificar(path.join(carpeta, 'ausente.exe')), /Falta VC/)
console.log(
  'OK: runtime ausente/alterado rechazado; identidad conservada y directorio limpio coherente según electron-builder instalado.'
)
