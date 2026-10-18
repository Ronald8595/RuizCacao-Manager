import { mkdir, mkdtemp, chmod, open, rename, link, unlink, rm, rmdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { integridadArchivo } from './respaldo-integridad'
import { copiarStreaming } from './archivo-stream'
import type { BackupStorage, BackupWorkspace } from './respaldo-portable'

export class AlmacenRespaldoLocal implements BackupStorage {
  constructor(
    private readonly destino: string,
    private readonly temporales: string,
    private readonly seleccion?: { nombreArchivo: string; alPublicar: () => void }
  ) {}
  async preparar(): Promise<BackupWorkspace> {
    await mkdir(this.destino, { recursive: true })
    await mkdir(this.temporales, { recursive: true })
    const privado = await mkdtemp(join(this.temporales, 'respaldo-'))
    await chmod(privado, 0o700)
    let provisional: string | undefined
    let completo: string | undefined
    return {
      dump: join(privado, 'database.dump'),
      paquete: join(privado, 'paquete.tmp'),
      publicar: async (nombre, signal) => {
        signal?.throwIfAborted()
        if (!/^RuizCacao_\d{4}-\d\d-\d\d_\d\d-\d\d$/.test(nombre))
          throw new Error('Nombre de respaldo inválido.')
        // Crear temporal exclusivo EN el destino: rename nunca cruza filesystems.
        const carpetaPublicacion = await mkdtemp(join(this.destino, '.ruizcacao-'))
        provisional = join(carpetaPublicacion, 'publicacion.tmp')
        completo = join(carpetaPublicacion, 'completo.tmp')
        await copiarStreaming(join(privado, 'paquete.tmp'), provisional, signal)
        const origen = await integridadArchivo(join(privado, 'paquete.tmp'), signal)
        const copia = await integridadArchivo(provisional, signal)
        if (origen.sha256 !== copia.sha256 || origen.tamano !== copia.tamano)
          throw new Error('La copia provisional no supera la verificación de integridad.')
        const handle = await open(provisional, 'r+')
        try {
          await handle.sync()
        } finally {
          await handle.close()
        }
        await rename(provisional, completo)
        // rename de Node puede reemplazar un archivo existente. link publica el
        // archivo completo atómicamente con no-replace, incluso frente a carreras.
        // Sin hardlinks, fallar cerrado: no degradar a copia parcial o rename inseguro.
        signal?.throwIfAborted()
        this.seleccion?.alPublicar()
        for (let i = 0; i < 10000; i++) {
          if (!this.seleccion) signal?.throwIfAborted()
          const elegido = this.seleccion?.nombreArchivo
          if (elegido && (dirname(elegido) !== '.' || !elegido.toLowerCase().endsWith('.back')))
            throw new Error('Nombre de respaldo inválido.')
          const stem = elegido ? elegido.slice(0, -5) : nombre
          const final = join(this.destino, stem + (i ? '_' + String(i) : '') + '.back')
          try {
            await link(completo, final)
            return final
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
          }
        }
        throw new Error('No hay un nombre de respaldo disponible.')
      },
      limpiar: async () => {
        // Directorios únicos creados por esta operación; nunca una ruta del manifiesto.
        await rm(privado, { recursive: true, force: true })
        if (provisional)
          await unlink(provisional).catch((e) => {
            if (e.code !== 'ENOENT') throw e
          })
        if (completo) {
          await unlink(completo).catch((e) => {
            if (e.code !== 'ENOENT') throw e
          })
          await rmdir(dirname(completo))
        }
      }
    }
  }
}
