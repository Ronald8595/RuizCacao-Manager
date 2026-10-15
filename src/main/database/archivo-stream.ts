import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
export async function copiarStreaming(
  origen: string,
  destino: string,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted()
  await pipeline(
    createReadStream(origen),
    createWriteStream(destino, { flags: 'wx', mode: 0o600 }),
    { signal }
  )
}
