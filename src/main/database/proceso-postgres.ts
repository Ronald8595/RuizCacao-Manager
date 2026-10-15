import { spawn } from 'node:child_process'
export const procesosPostgresActivos = new Set<number>()
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
    // Drenar stderr sin guardar argumentos, SQL, conexiones ni secretos en errores.
    child.stderr.on('data', () => {})
    child.once('error', (e) => {
      error = e
    })
    child.once('close', (code, senal) => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortar)
      if (child.pid) procesosPostgresActivos.delete(child.pid)
      if (error) reject(error)
      else if (code !== 0 || senal)
        reject(
          Object.assign(new Error('No se completó la herramienta PostgreSQL.'), {
            code: code ?? 'SIGNAL'
          })
        )
      else resolve(Buffer.concat(salida).toString('utf8'))
    })
  })
}
