// Solo selecciona el DOM visible; no filtra/pagina el Snapshot ni consulta PostgreSQL.
export function rangoFilas(
  total: number,
  scroll: number,
  alto: number,
  fila = 56,
  margen = 8
): {
  inicio: number
  fin: number
  antes: number
  despues: number
} {
  const inicio = Math.max(0, Math.min(total, Math.floor(Math.max(0, scroll - 44) / fila) - margen))
  const fin = Math.min(
    total,
    Math.max(inicio, Math.ceil(Math.max(0, scroll - 44) / fila) + Math.ceil(alto / fila) + margen)
  )
  return { inicio, fin, antes: inicio * fila, despues: (total - fin) * fila }
}
