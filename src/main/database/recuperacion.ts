import { createPublicKey, verify, randomBytes, randomUUID, type KeyObject } from 'node:crypto'
import { ErrorNegocio } from '../../shared/errorNegocio'
export interface Solicitud {
  version: 1
  installation_id: string
  request_id: string
  nonce: string
  purpose: 'recovery_password'
}
export const canonico = (s: Solicitud): string =>
  JSON.stringify([s.version, s.installation_id, s.request_id, s.nonce, s.purpose])
export const tokenSolicitud = (s: Solicitud): string =>
  Buffer.from(canonico(s)).toString('base64url')
export function nuevaSolicitud(installation_id: string): Solicitud {
  return {
    version: 1,
    installation_id,
    request_id: randomUUID(),
    nonce: randomBytes(32).toString('base64url'),
    purpose: 'recovery_password'
  }
}
export function leerSolicitud(token: string): Solicitud {
  try {
    if (typeof token !== 'string' || token.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(token))
      throw Error()
    const p = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))
    if (
      !Array.isArray(p) ||
      p.length !== 5 ||
      p[0] !== 1 ||
      p[4] !== 'recovery_password' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p[1]) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p[2]) ||
      !/^[A-Za-z0-9_-]{43}$/.test(p[3])
    )
      throw Error()
    const s: Solicitud = {
      version: 1,
      installation_id: p[1],
      request_id: p[2],
      nonce: p[3],
      purpose: p[4]
    }
    if (tokenSolicitud(s) !== token) throw Error()
    return s
  } catch {
    throw new ErrorNegocio('La solicitud de recuperación no es válida.')
  }
}
export function clavePublica(pem: string): KeyObject {
  if (pem.includes('PRIVATE KEY'))
    throw new ErrorNegocio('La recuperación no está configurada. Contacta con soporte.')
  const key = createPublicKey(pem)
  if (key.asymmetricKeyType !== 'ed25519')
    throw new ErrorNegocio('La recuperación no está configurada. Contacta con soporte.')
  return key
}
export function verificarAutorizacion(autorizacion: string, publica: string): Solicitud {
  try {
    if (typeof autorizacion !== 'string' || autorizacion.length > 2048) throw Error()
    const partes = autorizacion.trim().split('.')
    if (partes.length !== 2 || !/^[A-Za-z0-9_-]{86}$/.test(partes[1])) throw Error()
    const solicitud = leerSolicitud(partes[0])
    if (
      !verify(
        null,
        Buffer.from(canonico(solicitud)),
        clavePublica(publica),
        Buffer.from(partes[1], 'base64url')
      )
    )
      throw Error()
    return solicitud
  } catch {
    throw new ErrorNegocio('La autorización no es válida. Revisa el código recibido de soporte.')
  }
}
