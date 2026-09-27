/**
 * @description Datos institucionales que aparecen en comprobantes y reportes.
 * @businessLogic Este es el único lugar que debe editarse cuando Grupo Ruiz
 * cambie su información comercial; evita tener RUC/dirección/nombre repetidos.
 * @dbMigration En PostgreSQL estos datos pueden pasar a una tabla de empresa,
 * pero esta constante puede mantenerse como valor inicial/local.
 */
export const EMPRESA = {
  // EDITAR AQUÍ: razón social / nombre que debe aparecer en documentos.
  nombre: 'Grupo Ruiz',
  // EDITAR AQUÍ: nombre comercial de la aplicación/negocio.
  nombreComercial: 'ExporCacao',
  // EDITAR AQUÍ: RUC real de Grupo Ruiz. No inventar este dato.
  ruc: '1717299893001',
  // EDITAR AQUÍ: dirección comercial completa.
  direccion: 'Buena fe, FUMISA KM 32 via santo domingo frente al comedor marely',
  // EDITAR AQUÍ: teléfono comercial, si debe imprimirse.
  telefono: '',
  // EDITAR AQUÍ: correo comercial, si debe imprimirse.
  correo: ''
} as const
