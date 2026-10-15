const { load, root } = require('./loader.cjs')
const fs = require('node:fs/promises')
const { join } = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { randomUUID, createHash, randomBytes } = require('node:crypto')
const { ZipFile } = require('yazl')
const { openPromise } = require('yauzl')
const { createWriteStream } = require('node:fs')
const { pipeline } = require('node:stream/promises')
const { GenerarRespaldoPortable, PRODUCT_ID } = load(
  join(root, 'src/main/database/respaldo-portable.ts')
)
const { PaqueteRespaldoZip } = load(join(root, 'src/main/database/respaldo-paquete.ts'))
const { AlmacenRespaldoLocal } = load(join(root, 'src/main/database/respaldo-storage.ts'))
const { integridadArchivo } = load(join(root, 'src/main/database/respaldo-integridad.ts'))

async function main() {
  const carpeta = await fs.mkdtemp(join(os.tmpdir(), 'rcm-paquete-'))
  let n = 0
  const check = async (nombre, fn) => {
    await fn()
    n++
    console.log('OK portable ' + nombre)
  }
  const dump = Buffer.concat([Buffer.from('PGDMP'), randomBytes(256 * 1024)])
  const manifest = {
    product_id: PRODUCT_ID,
    format_version: 1,
    backup_id: randomUUID(),
    created_at_utc: '2026-10-14T18:30:00.000Z',
    app_version: '1.2.1',
    schema_version: 10,
    postgres_server_major: 18,
    pg_dump_major: 18,
    backup_type: 'manual',
    database_dump_filename: 'database.dump',
    database_dump_size: dump.length,
    database_dump_sha256: createHash('sha256').update(dump).digest('hex')
  }
  const paquete = new PaqueteRespaldoZip()
  const destino = join(carpeta, 'OneDrive Google Drive Dropbox', 'Espacios Ñandú 中文')
  const almacen = new AlmacenRespaldoLocal(destino, join(carpeta, 'privado'))
  const exportador = {
    exportar: async (ruta) => {
      await fs.writeFile(ruta, dump, { flag: 'wx' })
      return {
        id: manifest.backup_id,
        fecha: manifest.created_at_utc,
        esquema: 10,
        servidorMajor: 18,
        herramientaMajor: 18,
        tamano: dump.length,
        sha256: manifest.database_dump_sha256
      }
    }
  }
  const crear = (p = paquete, s = almacen, auth = async () => {}) =>
    new GenerarRespaldoPortable(exportador, p, s, auth, '1.2.1').ejecutar()
  const malformado = async (nombre, m, entries = []) => {
    const ruta = join(carpeta, nombre + '.back')
    const z = new ZipFile()
    const fin = pipeline(z.outputStream, createWriteStream(ruta))
    z.addBuffer(Buffer.from(typeof m === 'string' ? m : JSON.stringify(m)), 'manifest.json', {
      compress: false
    })
    z.addBuffer(dump, 'database.dump', { compress: false })
    for (const e of entries)
      z.addBuffer(Buffer.from('otro'), e.nombre, { compress: false, ...e.options })
    z.end()
    await fin
    return ruta
  }
  try {
    await check('autorización denegada no exporta ni crea workspace', async () => {
      let preparado = false
      await assert.rejects(
        crear(
          paquete,
          {
            preparar: async () => {
              preparado = true
            }
          },
          async () => {
            throw Error('denegado')
          }
        )
      )
      assert.equal(preparado, false)
    })
    const resultado = await crear()
    // Comparación explícita de manifest y TOC; no depende de sidecars.
    await check(
      'archivo único Unicode/espacios, manifest v1, hash/tamaño y TOC exactos',
      async () => {
        assert.deepEqual(await paquete.verificar(resultado.archivo), manifest)
        const z = await openPromise(resultado.archivo)
        const nombres = []
        for await (const e of z.eachEntry()) nombres.push(e.fileName)
        assert.deepEqual(nombres, ['manifest.json', 'database.dump'])
        assert.deepEqual(await fs.readdir(destino), ['RuizCacao_2026-10-14_18-30.back'])
      }
    )
    await check('extracción a nombre fijo y SHA por streaming', async () => {
      const extraido = join(carpeta, 'extraido.dump')
      await paquete.extraerDump(resultado.archivo, extraido)
      assert.deepEqual(await integridadArchivo(extraido), {
        tamano: dump.length,
        sha256: manifest.database_dump_sha256
      })
      await assert.rejects(paquete.extraerDump(resultado.archivo, extraido))
      assert.deepEqual(await fs.readFile(extraido), dump)
    })
    await check('colisiones concurrentes nunca sobrescriben', async () => {
      const original = await integridadArchivo(resultado.archivo)
      const copias = []
      // El controlador limita a un backup activo; storage conserva semántica no-overwrite.
      for (let i = 0; i < 5; i++) copias.push(await crear())
      assert.equal(new Set(copias.map((c) => c.archivo)).size, 5)
      assert.deepEqual(await integridadArchivo(resultado.archivo), original)
      for (const c of copias) assert.deepEqual(await paquete.verificar(c.archivo), manifest)
    })
    await check('fallo antes de publicar no deja .back ni temporales propios', async () => {
      const antes = await fs.readdir(destino)
      await assert.rejects(
        crear({
          escribir: async () => {
            throw Error('fallo simulado')
          },
          verificar: paquete.verificar.bind(paquete)
        })
      )
      assert.deepEqual(await fs.readdir(destino), antes)
      assert.deepEqual(await fs.readdir(join(carpeta, 'privado')), [])
    })
    await check('fallo secundario conserva archivo válido y devuelve advertencia', async () => {
      let workspace
      const r = await crear(paquete, {
        preparar: async () => {
          workspace = await almacen.preparar()
          return {
            ...workspace,
            limpiar: async () => {
              throw Error('secreto que no debe mostrarse')
            }
          }
        }
      })
      assert.equal(r.advertencias.length, 1)
      assert.ok(!JSON.stringify(r).includes('secreto'))
      assert.deepEqual(await paquete.verificar(r.archivo), manifest)
      await workspace.limpiar()
    })
    await check('fallo de publicación limpia operación sin tocar respaldos previos', async () => {
      const antes = await fs.readdir(destino)
      await assert.rejects(
        crear(paquete, {
          preparar: async () => {
            const workspace = await almacen.preparar()
            return {
              ...workspace,
              publicar: async () => {
                throw Error('disco de destino no disponible')
              }
            }
          }
        })
      )
      assert.deepEqual(await fs.readdir(destino), antes)
      assert.deepEqual(await fs.readdir(join(carpeta, 'privado')), [])
    })
    await check('corrupción de metadatos con JSON aún válido rechazada por CRC', async () => {
      const data = await fs.readFile(resultado.archivo)
      const indice = data.indexOf('1.2.1')
      assert.ok(indice > 0)
      data.write('1.2.2', indice)
      const corrupto = join(carpeta, 'crc.back')
      await fs.writeFile(corrupto, data)
      await assert.rejects(paquete.verificar(corrupto))
    })
    await check('hash de 64 MiB sin readFile del dump', async () => {
      const ruta = join(carpeta, 'streaming.dump')
      const handle = await fs.open(ruta, 'wx')
      const bloque = randomBytes(1024 * 1024)
      const hash = createHash('sha256')
      try {
        for (let i = 0; i < 64; i++) {
          await handle.writeFile(bloque)
          hash.update(bloque)
        }
      } finally {
        await handle.close()
      }
      const leerArchivo = fs.readFile
      fs.readFile = async () => {
        throw Error('readFile completo prohibido')
      }
      try {
        assert.deepEqual(await integridadArchivo(ruta), {
          tamano: 64 * 1024 * 1024,
          sha256: hash.digest('hex')
        })
      } finally {
        fs.readFile = leerArchivo
      }
    })
    await check('truncado y extensión falsa rechazados', async () => {
      const data = await fs.readFile(resultado.archivo)
      const truncado = join(carpeta, 'truncado.back')
      await fs.writeFile(truncado, data.subarray(0, data.length - 25))
      await assert.rejects(paquete.verificar(truncado))
      await fs.writeFile(truncado, 'no es zip')
      await assert.rejects(paquete.verificar(truncado))
    })
    for (const [nombre, cambio] of [
      ['product', { product_id: 'ajeno' }],
      ['version', { format_version: 2 }],
      ['hash', { database_dump_sha256: '0'.repeat(64) }],
      ['tamano', { database_dump_size: 10 }],
      ['esquema', { schema_version: -1 }],
      ['secreto', { password: 'prohibido' }],
      ['fecha', { created_at_utc: '2026-02-30T18:30:00.000Z' }]
    ])
      await check('manifest inválido: ' + nombre, async () => {
        await assert.rejects(
          paquete.verificar(await malformado(nombre, { ...manifest, ...cambio }))
        )
      })
    await check('JSON inválido rechazado', async () =>
      assert.rejects(paquete.verificar(await malformado('json', '{')))
    )
    await check('entrada adicional/ejecutable y nombre duplicado rechazados', async () => {
      for (const nombre of ['extra.txt', 'programa.exe', 'database.dump'])
        await assert.rejects(
          paquete.verificar(await malformado(randomUUID(), manifest, [{ nombre }]))
        )
    })
    await check(
      'rutas internas absolutas, traversal y duplicado de dos entradas rechazados',
      async () => {
        const data = await fs.readFile(resultado.archivo)
        for (const nombre of ['/atabase.dump', '../badxx.dump', 'manifest.json']) {
          assert.equal(Buffer.byteLength(nombre), 13)
          const alterado = Buffer.from(data)
          let i = 0
          while ((i = alterado.indexOf('database.dump', i)) >= 0) {
            alterado.write(nombre, i)
            i += 13
          }
          const ruta = join(carpeta, randomUUID() + '.back')
          await fs.writeFile(ruta, alterado)
          await assert.rejects(paquete.verificar(ruta))
        }
      }
    )
    await check(
      'symlink y permiso ejecutable rechazados incluso con nombre permitido',
      async () => {
        for (const mode of [0o120600, 0o100700]) {
          const ruta = join(carpeta, randomUUID() + '.back')
          const z = new ZipFile(),
            fin = pipeline(z.outputStream, createWriteStream(ruta))
          z.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json', { compress: false })
          z.addBuffer(dump, 'database.dump', { compress: false, mode })
          z.end()
          await fin
          await assert.rejects(paquete.verificar(ruta))
        }
      }
    )
    await check(
      'límite de tamaño y extracción inválida no destruyen destino existente',
      async () => {
        await assert.rejects(new PaqueteRespaldoZip(1024).verificar(resultado.archivo))
        const ruta = join(carpeta, 'preservar.dump')
        await fs.writeFile(ruta, 'conservar')
        await assert.rejects(
          paquete.extraerDump(
            await malformado('hash-extraer', { ...manifest, database_dump_sha256: '0'.repeat(64) }),
            ruta
          )
        )
        assert.equal(await fs.readFile(ruta, 'utf8'), 'conservar')
      }
    )
    console.log('Pruebas del contenedor portable completas: ' + n)
  } finally {
    await fs.rm(carpeta, { recursive: true, force: true })
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
