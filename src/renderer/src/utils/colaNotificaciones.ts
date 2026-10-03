// Ordenar lecturas y mutaciones impide que una lectura anterior restaure un
// aviso borrado. La generación descarta respuestas de una sesión desmontada.
export class ColaNotificaciones {
  private cola: Promise<unknown> = Promise.resolve()
  private generacion = 0
  activar(): void {
    this.generacion++
  }
  invalidar(): void {
    this.generacion++
  }
  ejecutar<T>(consulta: () => Promise<T>, aplicar: (valor: T) => void): Promise<boolean> {
    const generacion = this.generacion
    const tarea = this.cola.then(async () => {
      if (generacion !== this.generacion) return false
      let valor: T
      try {
        valor = await consulta()
      } catch (error) {
        if (generacion !== this.generacion) return false
        throw error
      }
      if (generacion !== this.generacion) return false
      aplicar(valor)
      return true
    })
    this.cola = tarea.catch(() => {})
    return tarea
  }
}
