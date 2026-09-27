/** El guardado de documentos no recibe conexiones ni modifica el dominio. */
export async function guardarDocumento(
  pdf: Buffer,
  elegir: () => Promise<{ canceled: boolean; filePath?: string }>,
  escribir: (ruta: string, contenido: Buffer) => Promise<void>
): Promise<{ canceled: boolean; filePath?: string }> {
  const result = await elegir()
  if (result.canceled || !result.filePath) return { canceled: true }
  await escribir(result.filePath, pdf)
  return { canceled: false, filePath: result.filePath }
}
