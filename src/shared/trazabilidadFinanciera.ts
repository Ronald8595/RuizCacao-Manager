type Origen = 'compra' | 'venta' | 'manual' | 'gasto'

/** Solo presentación de fechas persistidas; nunca participa en importes o filtros. */
export function trazabilidadFinanciera(
  origen: Origen,
  fechaEfectiva: string,
  fechaOrigen?: string | null,
  registroGasto?: string | null
): string {
  const fecha = (valor: string): string => {
    const [anio, mes, dia] = valor.split('-')
    return `${dia}/${mes}/${anio}`
  }
  if (origen !== 'gasto') {
    const etiqueta = {
      compra: 'Fecha de compra',
      venta: 'Fecha de venta',
      manual: 'Fecha de cuenta'
    }[origen]
    return `${etiqueta}: ${fechaOrigen ? fecha(fechaOrigen) : 'no disponible'}`
  }
  if (!registroGasto || !Number.isFinite(Date.parse(registroGasto))) return ''
  const instante = new Date(registroGasto)
  const diaRegistro = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(instante)
  if (diaRegistro === fechaEfectiva) return ''
  const hora = new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(instante)
  return `Registrado: ${fecha(diaRegistro)} ${hora} (Guayaquil)`
}
