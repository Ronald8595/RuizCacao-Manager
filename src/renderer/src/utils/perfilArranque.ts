export const perfilActivo = (): boolean => !!window.api?.perfil
export function marcaPerfil(
  nombre: string,
  detalle?: Record<string, string | number | boolean>
): void {
  window.api?.perfil?.marca(nombre, performance.timeOrigin + performance.now(), detalle)
}
export function despuesDePintar(
  nombre: string,
  detalle?: Record<string, string | number | boolean>
): () => void {
  if (!perfilActivo()) return () => {}
  let segundo = 0
  let tarea: ReturnType<typeof setTimeout> | undefined
  const primero = requestAnimationFrame(() => {
    segundo = requestAnimationFrame(() => {
      tarea = setTimeout(() => marcaPerfil(nombre, detalle), 0)
    })
  })
  return () => {
    cancelAnimationFrame(primero)
    cancelAnimationFrame(segundo)
    clearTimeout(tarea)
  }
}
