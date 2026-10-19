import { spawn } from 'node:child_process'
export const procesosPostgresActivos = new Set<number>()
// Clasificar stderr sin conservar texto SQL, rutas ni datos del respaldo.
export function categoriaErrorHerramienta(linea: string): string | undefined {
  if (/permission denied|access is denied|permiso denegado|acceso denegado/i.test(linea))
    return 'access_denied'
  if (/no such file|cannot find|no se encuentra/i.test(linea)) return 'missing_file'
  if (/connection.*(failed|refused)|could not connect|no se pudo conectar/i.test(linea))
    return 'connection'
  if (/unsupported version|invalid archive|input file.*(short|valid)|corrupt/i.test(linea))
    return 'archive'
  if (/could not execute query|ERROR:|error:/i.test(linea)) return 'sql'
  return undefined
}
/** Cancela el hijo directo y espera close ANTES de resolver/rechazar y limpiar archivos. */
export function procesoPostgres(
  binario: string,
  args: string[],
  password: string,
  signal?: AbortSignal
): Promise<string> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(binario, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PGPASSWORD: password }
    })
    let error: Error | undefined
    let tamano = 0
    const salida: Buffer[] = []
    let lineaError = ''
    let categoriaHerramienta: string | undefined
    const abortar = (): void => {
      error = Object.assign(new Error('Operación cancelada.'), { name: 'AbortError' })
      child.kill()
    }
    const timeout = setTimeout(() => {
      error = Object.assign(new Error('Tiempo de herramienta agotado.'), { code: 'ETIMEDOUT' })
      child.kill()
    }, 300000)
    signal?.addEventListener('abort', abortar, { once: true })
    child.on('spawn', () => {
      if (child.pid) procesosPostgresActivos.add(child.pid)
      if (signal?.aborted) abortar()
    })
    child.stdout.on('data', (bytes: Buffer) => {
      tamano += bytes.length
      if (tamano > 8 * 1024 * 1024) {
        error = new Error('Salida de herramienta demasiado grande.')
        child.kill()
      } else salida.push(bytes)
    })
    // Buffer acotado; al cerrar solo se conserva una categoría de lista fija.
    child.stderr.on('data', (bytes: Buffer) => {
      for (const fragmento of bytes.toString('utf8').split(/(\n)/)) {
        if (fragmento === '\n') {
          categoriaHerramienta ??= categoriaErrorHerramienta(lineaError)
          lineaError = ''
        } else lineaError = (lineaError + fragmento).slice(0, 2048)
      }
    })
    child.once('error', (e) => {
      error = e
    })
    child.once('close', (code, senal) => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortar)
      if (child.pid) procesosPostgresActivos.delete(child.pid)
      categoriaHerramienta ??= categoriaErrorHerramienta(lineaError)
      lineaError = ''
      if (error) reject(error)
      else if (code !== 0 || senal)
        reject(
          Object.assign(new Error('No se completó la herramienta PostgreSQL.'), {
            code: code ?? 'SIGNAL',
            categoriaHerramienta: categoriaHerramienta ?? 'other'
          })
        )
      else resolve(Buffer.concat(salida).toString('utf8'))
    })
  })
}
