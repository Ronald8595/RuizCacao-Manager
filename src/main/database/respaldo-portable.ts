// Contratos y coordinación: sin filesystem, Electron ni procesos hijos.
export const PRODUCT_ID = 'com.gruporuiz.ruizcacao-manager'
export interface ExportacionRespaldo {
  id: string
  fecha: string
  esquema: number
  servidorMajor: number
  herramientaMajor: number
  tamano: number
  sha256: string
}
export interface ManifestPortable {
  product_id: typeof PRODUCT_ID
  format_version: 1
  backup_id: string
  created_at_utc: string
  app_version: string
  schema_version: number
  postgres_server_major: number
  pg_dump_major: number
  backup_type: 'manual'
  database_dump_filename: 'database.dump'
  database_dump_size: number
  database_dump_sha256: string
}
export interface BackupExporter {
  exportar(destinoDump: string): Promise<ExportacionRespaldo>
}
export interface BackupPackage {
  escribir(dump: string, manifest: ManifestPortable, destino: string): Promise<void>
  verificar(archivo: string): Promise<ManifestPortable>
}
export interface BackupWorkspace {
  dump: string
  paquete: string
  publicar(nombre: string): Promise<string>
  limpiar(): Promise<void>
}
export interface BackupStorage {
  preparar(): Promise<BackupWorkspace>
}
export interface ResultadoPortable {
  archivo: string
  manifest: ManifestPortable
  advertencias: string[]
}
export class GenerarRespaldoPortable {
  constructor(
    private readonly exporter: BackupExporter,
    private readonly paquete: BackupPackage,
    private readonly storage: BackupStorage,
    private readonly autorizar: () => Promise<void>,
    private readonly versionApp: string
  ) {}
  async ejecutar(): Promise<ResultadoPortable> {
    await this.autorizar()
    const workspace = await this.storage.preparar()
    let publicado = false
    const advertencias: string[] = []
    try {
      const e = await this.exporter.exportar(workspace.dump)
      const manifest: ManifestPortable = {
        product_id: PRODUCT_ID,
        format_version: 1,
        backup_id: e.id,
        created_at_utc: e.fecha,
        app_version: this.versionApp,
        schema_version: e.esquema,
        postgres_server_major: e.servidorMajor,
        pg_dump_major: e.herramientaMajor,
        backup_type: 'manual',
        database_dump_filename: 'database.dump',
        database_dump_size: e.tamano,
        database_dump_sha256: e.sha256
      }
      await this.paquete.escribir(workspace.dump, manifest, workspace.paquete)
      await this.paquete.verificar(workspace.paquete)
      // Nombre UTC explícito; no depende del huso horario de la PC.
      const nombre = 'RuizCacao_' + e.fecha.slice(0, 16).replace('T', '_').replace(':', '-')
      const archivo = await workspace.publicar(nombre)
      publicado = true
      return { archivo, manifest, advertencias }
    } finally {
      try {
        await workspace.limpiar()
      } catch {
        if (publicado)
          advertencias.push('El respaldo se publicó; no se completó la limpieza temporal.')
        // Una limpieza secundaria nunca oculta el fallo primario ni elimina el archivo final.
      }
    }
  }
}
