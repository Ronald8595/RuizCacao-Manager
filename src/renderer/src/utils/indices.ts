/** Igual que find: conserva la primera coincidencia y la igualdad del tipo de la clave. */
export function indexarPrimero<T, K>(filas: readonly T[], clave: (fila: T) => K): Map<K, T> {
  const indice = new Map<K, T>()
  for (const fila of filas) {
    const k = clave(fila)
    if (!indice.has(k)) indice.set(k, fila)
  }
  return indice
}
