import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export async function integridadArchivo(
  ruta: string,
  signal?: AbortSignal
): Promise<{ tamano: number; sha256: string }> {
  signal?.throwIfAborted()
  const antes = await stat(ruta)
  const hash = createHash('sha256')
  let bytes = 0
  for await (const fragmento of createReadStream(ruta, { signal })) {
    bytes += fragmento.length
    hash.update(fragmento)
  }
  const despues = await stat(ruta)
  if (
    !antes.isFile() ||
    bytes !== antes.size ||
    despues.size !== antes.size ||
    despues.mtimeMs !== antes.mtimeMs
  )
    throw new Error('El archivo cambió durante su verificación.')
  return { tamano: antes.size, sha256: hash.digest('hex') }
}
