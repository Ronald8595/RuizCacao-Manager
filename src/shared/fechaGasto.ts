/** Día efectivo del gasto, independiente del huso del equipo y del instante de registro. */
export function hoyGasto(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(ahora)
}

export function errorFechaGasto(fecha: string, hoy = hoyGasto()): string | undefined {
  if (!fecha) return 'La fecha es obligatoria.'
  const instante = Date.parse(fecha + 'T12:00:00Z')
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    !Number.isFinite(instante) ||
    new Date(instante).toISOString().slice(0, 10) !== fecha ||
    fecha < '0001-01-01'
  )
    return 'Selecciona una fecha válida.'
  if (fecha > hoy) return 'La fecha del gasto no puede ser posterior a hoy.'
  return undefined
}
