import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Client } from 'pg'
const ejecutar = promisify(execFile)
let paginaWindows: Promise<number> | undefined

export async function leerDirectorioPostgres(db: Pick<Client, 'query'>): Promise<string> {
  const bytes = (
    await db.query("SELECT pg_catalog.textsend(current_setting('data_directory')) AS directorio")
  ).rows[0].directorio as Buffer
  return rutaDirectorioPostgres(bytes)
}

// El GUC data_directory de PostgreSQL Windows puede contener bytes ACP aunque
// server/client_encoding sean UTF8. No adivinar ni probar rutas alternativas.
export function decodificarRutaACP(bytes: Buffer, pagina: number): string {
  const especiales: Record<number, string> = {
    874: 'windows-874',
    932: 'shift_jis',
    936: 'gbk',
    949: 'euc-kr',
    950: 'big5',
    65001: 'utf-8'
  }
  const etiqueta =
    especiales[pagina] ?? (pagina >= 1250 && pagina <= 1258 ? `windows-${pagina}` : undefined)
  if (!etiqueta) throw new Error('Página de códigos de Windows no soportada.')
  return new TextDecoder(etiqueta, { fatal: true }).decode(bytes)
}

export async function rutaDirectorioPostgres(bytes: Buffer): Promise<string> {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    if (process.platform !== 'win32') throw error
    // Consulta local de solo lectura, una vez y solo durante restore con ruta ACP.
    paginaWindows ??= ejecutar(
      'reg.exe',
      ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Nls\\CodePage', '/v', 'ACP'],
      { windowsHide: true }
    ).then(({ stdout }) => {
      const pagina = stdout.match(/\bACP\s+REG_SZ\s+(\d+)\b/)
      if (!pagina) throw new Error('No se pudo determinar la página de códigos de Windows.')
      return Number(pagina[1])
    })
    return decodificarRutaACP(bytes, await paginaWindows)
  }
}
