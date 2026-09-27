import type { ApiPersistencia } from '../shared/persistencia'

declare global {
  interface Window {
    electron: { process: { versions: Record<string, string | undefined> } }
    api: {
      datos: ApiPersistencia
      copiarTexto: (texto: string) => Promise<boolean>
      generarReportePDF: (
        html: string,
        nombreArchivo: string,
        onGenerado?: () => void
      ) => Promise<{ canceled: boolean; filePath?: string; error?: string }>
      generarComprobantePDF: (
        html: string,
        nombreArchivo: string
      ) => Promise<{ canceled: boolean; filePath?: string }>
    }
  }
}
