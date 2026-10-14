// Instrumentación opt-in. No guarda valores comerciales, SQL ni credenciales.
type Detalle = Record<string, string | number | boolean>
interface RegistroPerfil {
  marcas: { nombre: string; epoch: number; proceso: string; detalle?: Detalle }[]
}
const clave = Symbol.for('ruizcacao.perfil.arranque')
const globalPerfil = globalThis as typeof globalThis & { [clave]?: RegistroPerfil }
export const perfilActivo = (): boolean =>
  !!process.versions.electron && process.env.RCM_PERFIL_ARRANQUE === '1'
export const relojPerfil = (): number => performance.timeOrigin + performance.now()
export function marcaPerfil(nombre: string, detalle?: Detalle): void {
  if (!perfilActivo()) return
  const registro = (globalPerfil[clave] ??= { marcas: [] })
  registro.marcas.push({ nombre, epoch: relojPerfil(), proceso: 'main', detalle })
}
export function recibirMarcaPerfil(
  nombre: string,
  epoch: number,
  proceso: string,
  detalle?: Detalle
): void {
  if (!perfilActivo()) return
  const registro = (globalPerfil[clave] ??= { marcas: [] })
  registro.marcas.push({ nombre, epoch, proceso, detalle })
}
