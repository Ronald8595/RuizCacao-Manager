/** Mensajes redactados por la aplicación; nunca envolver errores externos con esta clase. */
export class ErrorNegocio extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorNegocio'
  }
}
