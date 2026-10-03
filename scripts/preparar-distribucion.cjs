module.exports = function prepararDistribucion(context) {
  require('./preparar-clave.cjs')()
  if (context.electronPlatformName === 'win32') require('./verificar-distribucion.cjs')
}
