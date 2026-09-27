// Dataset explícito QA: nunca se importa desde la aplicación o las migraciones.
const {createHash}=require('node:crypto')
const marca='QA FINAL V4'
const idOperacion=nombre=>{const h=createHash('sha256').update(marca+':'+nombre).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`}
async function crearDataset(db,fecha){
 const registros=[]
 const paso=async(nombre,comando,...args)=>{
  const r=await db.ejecutar(idOperacion(nombre),comando,args)
  registros.push({paso:nombre,operacion:idOperacion(nombre),id:r.resultado?.id})
  return r.resultado
 }
 const clientes=[],proveedores=[],empleados=[]
 for(let i=1;i<=2;i++){
  clientes.push(await paso('cliente'+i,'crearCliente',{nombreRazonSocial:`QA Final Cliente ${i===1?'Uno':'Dos'}`,identificacion:'000000000'+i,telefono:'0000000000'}))
  proveedores.push(await paso('proveedor'+i,'crearProveedor',{nombre:`QA Final Proveedor ${i===1?'Uno':'Dos'}`,ciRuc:'000000001'+i,estado:true}))
  empleados.push(await paso('empleado'+i,'crearEmpleado',{nombre:`QA Final Trabajador ${i===1?'Uno':'Dos'}`,estado:true}))
 }
 for(const [i,producto,cantidad,pagado] of [[0,'Cacao en Baba',20,200],[1,'Cacao Seco',10,20]])
  await paso('compra'+i,'registrarCompra',{fecha,proveedorId:proveedores[i].id,producto,cantidadQq:cantidad,precioCompraQq:10,impuestoPorcentaje:0,montoPagado:pagado,metodoPago:'Efectivo',observacion:marca})
 await paso('conversion','registrarConversionCacao',{fecha,cacaoBabaUtilizadoQq:6.6,factorConversion:3.3,observacion:marca})
 const ventas=[]
 for(const [i,peso,pagado] of [[0,1,20],[1,2,10]])
  ventas.push(await paso('venta'+i,'registrarVenta',{fechaVenta:fecha,clienteId:clientes[i].id,producto:'Cacao Seco',pesoBruto:peso,precioUnitario:20,impuestoPorcentaje:0,montoRecibido:pagado,metodoPago:'Efectivo',observacion:marca}))
 const cuenta=(await db.cargar()).datos.cuentas.find(c=>c.ventaId===ventas[1].id)
 if(!cuenta)throw Error('No se encontró la cuenta QA de venta parcial.')
 await paso('abono','registrarAbono',{cuentaId:cuenta.id,fecha,monto:5,tipo:'Abono',metodoPago:'Efectivo',observacion:marca})
 await paso('gasto','crearGastoManual',{fecha,categoria:'Otros',concepto:'',monto:5,observacion:marca})
 await paso('jornal','crearGastoManual',{fecha,categoria:'Mano de obra',concepto:'',monto:7,observacion:marca,empleado_id:empleados[0].id,tipo_pago:'pago'})
 return registros
}
module.exports={crearDataset,idOperacion,marca}

