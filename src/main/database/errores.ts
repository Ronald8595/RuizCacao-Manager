import { randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ErrorNegocio } from '../../shared/errorNegocio'
let carpetaLogs: string | undefined
export function configurarLogs(carpeta: string): void {
  carpetaLogs = carpeta
}
export interface ContextoError {
  modulo: string
  operacion: string
}
export function detalleSeguro(error: unknown, contexto: ContextoError, referencia: string): object {
  const e = error as {
    code?: unknown
    name?: unknown
    constraint?: unknown
    column?: unknown
    stack?: unknown
  }
  const identificador = (v: unknown): string | undefined =>
    typeof v === 'string' && /^[a-zA-Z0-9_]{1,100}$/.test(v) ? v : undefined
  // Excluir message/detail/query/parámetros/stdout/stderr y primera línea del stack.
  const stack =
    typeof e?.stack === 'string'
      ? e.stack
          .split('\n')
          .slice(1)
          .map((l) => l.match(/([a-zA-Z0-9_.-]+\.[cm]?[jt]sx?:\d+:\d+)\)?$/)?.[1])
          .filter(Boolean)
      : []
  return {
    fecha: new Date().toISOString(),
    modulo: contexto.modulo,
    operacion: contexto.operacion,
    referencia,
    tipo: identificador(e?.name),
    codigo:
      typeof e?.code === 'number' && Number.isSafeInteger(e.code) ? e.code : identificador(e?.code),
    restriccion: identificador(e?.constraint),
    columna: identificador(e?.column),
    stack
  }
}
export function traducirError(error: unknown, contexto: ContextoError): string {
  if (error instanceof ErrorNegocio) return error.message
  const e = error as { code?: unknown; constraint?: unknown },
    code = typeof e?.code === 'string' ? e.code : ''
  const referencia = randomBytes(4).toString('hex').toUpperCase()
  if (carpetaLogs)
    try {
      mkdirSync(carpetaLogs, { recursive: true })
      const archivo = join(carpetaLogs, 'incidencias.jsonl')
      if (
        (() => {
          try {
            return statSync(archivo).size
          } catch {
            return 0
          }
        })() > 2_000_000
      )
        renameSync(archivo, archivo + '.anterior')
      appendFileSync(archivo, JSON.stringify(detalleSeguro(error, contexto, referencia)) + '\n', {
        mode: 0o600
      })
    } catch {
      /* El fallo del log nunca expone el error original. */
    }
  if (code === '23505')
    return typeof e.constraint === 'string' && /identificacion|cedula/.test(e.constraint)
      ? 'La identificación ya está registrada.'
      : 'Ese registro ya existe. Revisa los datos antes de repetir la operación.'
  const mensajes: Record<string, string> = {
    '23503':
      'El registro relacionado no está disponible o está siendo utilizado. Revisa tu selección.',
    '23502': 'Falta un dato obligatorio. Completa los campos requeridos.',
    '23514': 'Uno de los valores no cumple las reglas permitidas. Revisa los datos.',
    '22001': 'El texto supera la longitud permitida. Acórtalo e inténtalo nuevamente.',
    '22P02': 'Uno de los datos tiene un formato inválido. Revisa los campos.',
    '22003': 'El número está fuera del rango permitido. Revisa el importe o la cantidad.',
    '22007': 'La fecha u hora no tiene un formato válido. Revisa la fecha.',
    '22008': 'La fecha u hora no tiene un formato válido. Revisa la fecha.',
    '40001': 'Hubo un conflicto temporal. Vuelve a intentar la operación.',
    '40P01': 'Hubo un conflicto temporal. Vuelve a intentar la operación.'
  }
  if (mensajes[code]) return mensajes[code]
  if (
    code.startsWith('08') ||
    ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '57P02', '57P03'].includes(code)
  )
    return 'No se pudo acceder al almacenamiento local. Reintenta o vuelve a abrir la aplicación.'
  return 'Ocurrió un problema inesperado. Código de referencia: ' + referencia
}
