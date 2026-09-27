// Preflight de producción: solo admite una clave PÚBLICA Ed25519.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const destino = path.resolve(__dirname, '../resources/security/recovery-public.pem')
function preparar() {
 const origen = process.env.RUIZCACAO_RECOVERY_PUBLIC_KEY || destino
 if (!fs.existsSync(origen)) throw Error('Falta la clave pública de producción. Define RUIZCACAO_RECOVERY_PUBLIC_KEY con su ruta externa. No se genera una clave de desarrollo.')
 const pem = fs.readFileSync(origen, 'utf8').trim()
 if (!/^-----BEGIN PUBLIC KEY-----[\s\S]*-----END PUBLIC KEY-----$/.test(pem) || pem.includes('PRIVATE KEY')) throw Error('Solo se acepta PEM público SPKI.')
 const key = crypto.createPublicKey(pem)
 if (key.asymmetricKeyType !== 'ed25519') throw Error('La clave pública debe ser Ed25519.')
 const normal = key.export({type:'spki',format:'pem'})
 if (!fs.existsSync(destino) || fs.readFileSync(destino,'utf8') !== normal) fs.writeFileSync(destino,normal)
 console.log('Clave pública Ed25519 verificada; no se incluye material privado.')
}
module.exports = preparar
if (require.main === module) { try { preparar() } catch(e) { console.error(e.message); process.exitCode=1 } }
