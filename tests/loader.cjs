const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '..')
const nativeRequire = createRequire(path.join(root, 'package.json'))
const ts = nativeRequire('typescript')
const cache = new Map()
function load(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }
  cache.set(file, mod)
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const req = (name) =>
    name.endsWith('.json')
      ? nativeRequire(path.resolve(path.dirname(file), name))
      : name.startsWith('.')
        ? load(path.resolve(path.dirname(file), name) + '.ts')
        : nativeRequire(name)
  new Function('require', 'module', 'exports', js)(req, mod, mod.exports)
  return mod.exports
}
module.exports = { load, root }
