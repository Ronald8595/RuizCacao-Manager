// Ejecutar SOLO en el equipo del desarrollador. Nunca se empaqueta con la aplicación.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto')
const { load, root } = require('../tests/loader.cjs')
const { leerSolicitud, canonico } = load(path.join(root, 'src/main/database/recuperacion.ts'))
const arg = (n) => {
  const i = process.argv.indexOf(n)
  return i < 0 ? undefined : process.argv[i + 1]
}
function externa(ruta, existente) {
  if (!ruta || !path.isAbsolute(ruta))
    throw Error('Indica una ruta absoluta de clave privada fuera del proyecto.')
  const real = existente
    ? fs.realpathSync(ruta)
    : path.join(fs.realpathSync(path.dirname(ruta)), path.basename(ruta))
  const rel = path.relative(fs.realpathSync(root), real)
  if (!rel || (!rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)))
    throw Error('La clave privada no puede estar dentro del proyecto.')
  return real
}
try {
  const passphrase = process.env.RUIZCACAO_KEY_PASSPHRASE
  if (!passphrase || passphrase.length < 16)
    throw Error('Define RUIZCACAO_KEY_PASSPHRASE con al menos 16 caracteres en tu entorno privado.')
  const privada = externa(
    arg('--private') || process.env.RUIZCACAO_PRIVATE_KEY,
    !process.argv.includes('generar')
  )
  if (process.argv.includes('generar')) {
    const publica = arg('--public')
    if (!publica) throw Error('Indica --public con la ruta de la clave pública.')
    if (fs.existsSync(privada) || fs.existsSync(publica))
      throw Error('No se sobrescriben claves existentes.')
    const par = crypto.generateKeyPairSync('ed25519')
    fs.writeFileSync(
      privada,
      par.privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase }),
      { flag: 'wx', mode: 0o600 }
    )
    fs.writeFileSync(publica, par.publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx' })
    console.log(
      'Claves creadas. Mantén la privada fuera del proyecto y copia solo la pública a resources/security/recovery-public.pem.'
    )
  } else if (process.argv.includes('firmar')) {
    const token = fs.readFileSync(arg('--request'), 'utf8').trim(),
      payload = leerSolicitud(token)
    const key = crypto.createPrivateKey({ key: fs.readFileSync(privada), passphrase })
    if (key.asymmetricKeyType !== 'ed25519') throw Error('Se requiere una clave Ed25519.')
    const autorizacion =
      token + '.' + crypto.sign(null, Buffer.from(canonico(payload)), key).toString('base64url')
    const salida = arg('--out')
    if (!salida) throw Error('Indica --out para guardar la autorización sin imprimirla en logs.')
    fs.writeFileSync(salida, autorizacion + '\n', { flag: 'wx', mode: 0o600 })
    console.log('Autorización firmada y guardada.')
  } else
    throw Error(
      'Uso: generar --private RUTA --public RUTA | firmar --private RUTA --request RUTA --out RUTA'
    )
} catch {
  console.error(
    'No se completó la operación. Revisa el comando, las rutas externas, la clave Ed25519 y la frase de protección.'
  )
  process.exitCode = 1
}
