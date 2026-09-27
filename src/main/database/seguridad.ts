import { ErrorNegocio } from '../../shared/errorNegocio'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
export function validarPassword(password: string): void {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128)
    throw new ErrorNegocio('La contraseña debe tener entre 12 y 128 caracteres.')
}
function derivar(texto: string, sal: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(texto, sal, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key)
    )
  )
}
export async function hashSecreto(texto: string): Promise<string> {
  const sal = randomBytes(16).toString('hex')
  return sal + ':' + (await derivar(texto, sal)).toString('hex')
}
export async function verificarSecreto(texto: string, hash: string): Promise<boolean> {
  if (typeof texto !== 'string' || texto.length > 256) return false
  const [sal, valor] = hash.split(':')
  if (!sal || !valor) return false
  const actual = await derivar(texto, sal),
    esperado = Buffer.from(valor, 'hex')
  return actual.length === esperado.length && timingSafeEqual(actual, esperado)
}
export function codigoRecuperacion(): string {
  return randomBytes(20)
    .toString('hex')
    .toUpperCase()
    .match(/.{1,5}/g)!
    .join('-')
}
export function normalizarCodigo(codigo: string): string {
  return codigo.replace(/[-\s]/g, '').toUpperCase()
}
