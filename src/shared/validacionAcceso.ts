export type ErroresAcceso = Partial<Record<'nombre' | 'password' | 'confirmar' | 'codigo', string>>
export function validarAcceso(input: {
  nombre: string
  password: string
  confirmar: string
  codigo: string
  modo: 'crear' | 'ingresar' | 'recuperar'
}): ErroresAcceso {
  const errores: ErroresAcceso = {}
  if (!input.nombre.trim()) errores.nombre = 'Escribe tu usuario.'
  else if (input.nombre.length > 80 || (input.modo === 'crear' && input.nombre.trim().length < 3))
    errores.nombre = 'El usuario debe tener entre 3 y 80 caracteres.'
  if (!input.password) errores.password = 'Escribe tu contraseña.'
  else if (input.password.length > 128 || (input.modo !== 'ingresar' && input.password.length < 12))
    errores.password = 'La contraseña debe tener entre 12 y 128 caracteres.'
  if (input.modo !== 'ingresar' && input.confirmar !== input.password)
    errores.confirmar = 'Las contraseñas no coinciden.'
  if (input.modo === 'recuperar' && !input.codigo.trim())
    errores.codigo = 'Ingresa la autorización recibida de soporte.'
  return errores
}
