import { VERSION_APP } from '../../../shared/version'
const vistasEnSesion = new Set<string>()
export const claveNovedades = (usuarioId: string, version = VERSION_APP): string =>
  `ruizcacao:novedades:${usuarioId}:${version}`
export function debeMostrarNovedades(
  usuarioId: string,
  storage: Pick<Storage, 'getItem'>,
  version = VERSION_APP
): boolean {
  const clave = claveNovedades(usuarioId, version)
  if (!usuarioId || vistasEnSesion.has(clave)) return false
  try {
    return storage.getItem(clave) !== 'visto'
  } catch {
    return true
  }
}
export function confirmarNovedades(
  usuarioId: string,
  storage: Pick<Storage, 'setItem'>,
  version = VERSION_APP
): void {
  const clave = claveNovedades(usuarioId, version)
  vistasEnSesion.add(clave)
  try {
    storage.setItem(clave, 'visto')
  } catch {
    /* El fallo de almacenamiento no impide continuar. */
  }
}
