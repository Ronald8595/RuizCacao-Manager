import { consultarListado, reporteCompleto } from './listados'
import type { FiltroListado, Listados } from '../../shared/listados'
import { consultarHistorialCompras, consultarHistorialVentas } from './historial-operaciones'
import type {
  FiltroHistorialOperaciones,
  PaginaCompras,
  PaginaVentas
} from '../../shared/historialOperaciones'
import { ErrorNegocio } from '../../shared/errorNegocio'
import { consultarHistorialStock } from './historial-stock'
import type { FiltroHistorialStock, PaginaHistorialStock } from '../../shared/historialStock'
import { migracionTres } from './migracion-tres'
import { migracionCuatro } from './migracion-cuatro'
import { migracionCinco } from './migracion-cinco'
import { migracionSeis } from './migracion-seis'
import { migracionSiete } from './migracion-siete'
import { migracionOcho } from './migracion-ocho'
import { migracionNueve, VERSION_ACTUAL as VERSION_ESQUEMA } from './migracion-nueve'
import { aplicarAnulacion } from '../../shared/anulaciones'
import { nuevaSolicitud, tokenSolicitud, verificarAutorizacion, clavePublica } from './recuperacion'
import { traducirError } from './errores'
import type { Respaldos } from './respaldos'
import { Pool, type PoolClient } from 'pg'
import { createHash, randomUUID } from 'node:crypto'
import { esquema, migracionUno } from './schema'
import {
  entidades,
  leerEntidades,
  guardarRegistro,
  sqlNormalizacion,
  type Entidad
} from './relacional'
import { hashSecreto, verificarSecreto, validarPassword } from './seguridad'
import { validarArgumentos } from './validacion'
import { crearDominio, PRODUCTOS } from '../../shared/dominio'
import {
  comandos,
  estadoInicial,
  type Snapshot,
  type ConexionLocal,
  type EstadoAplicacion,
  type Comando,
  type StockInicialInput
} from '../../shared/persistencia'

const tablas = Object.fromEntries(
  Object.entries(entidades).map(([key, value]) => [key, value.tabla])
) as Record<Entidad, string>
export function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}
const hora = (date: Date): string =>
  new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
export class BaseLocal {
  readonly pool: Pool
  private candado?: PoolClient
  private usuario: string | null = null
  private usuarioId: string | null = null
  private usuarioRol: 'administrador' | 'operador' | null = null
  private usuarioPrincipal = false
  private sesion = randomUUID()
  private cerrando = false
  constructor(
    config: ConexionLocal,
    private readonly opciones: { publica?: string; respaldos?: Respaldos } = {}
  ) {
    if (
      !['localhost', '127.0.0.1', '::1'].includes(config.host) ||
      !Number.isInteger(config.port) ||
      config.port < 1 ||
      config.port > 65535 ||
      !/^[a-zA-Z0-9_]{1,63}$/.test(config.database) ||
      typeof config.user !== 'string' ||
      !config.user ||
      typeof config.password !== 'string'
    )
      throw new ErrorNegocio(
        'El almacenamiento no está configurado correctamente. Contacta con soporte.'
      )
    this.pool = new Pool({
      ...config,
      max: 4,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
      idle_in_transaction_session_timeout: 30000,
      application_name: 'RuizCacao Manager'
    })
    this.pool.on('error', () => {
      this.usuario = null
      this.usuarioId = null
      this.usuarioRol = null
      this.usuarioPrincipal = false
    })
  }
  async transaccion<T>(fn: (db: PoolClient) => Promise<T>, lectura = false): Promise<T> {
    const db = await this.pool.connect()
    try {
      await db.query(lectura ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
      await db.query("SET LOCAL TIME ZONE 'America/Guayaquil'")
      await db.query('SELECT pg_advisory_xact_lock(7302026)')
      const value = await fn(db)
      await db.query('COMMIT')
      return value
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      db.release()
    }
  }
  async iniciar(): Promise<void> {
    this.candado = await this.pool.connect()
    this.candado.on('error', () => {
      this.usuario = null
      this.usuarioId = null
      this.usuarioRol = null
      this.usuarioPrincipal = false
    })
    const lock = await this.candado.query('SELECT pg_try_advisory_lock(7302027) AS ok')
    if (!lock.rows[0].ok)
      throw new ErrorNegocio('Otra instancia de RuizCacao Manager está usando esta base de datos.')
    const existe = (await this.pool.query("SELECT to_regclass('ruizcacao.migraciones') AS tabla"))
      .rows[0].tabla
    const anterior = existe
      ? Number(
          (await this.pool.query('SELECT max(version) AS version FROM ruizcacao.migraciones'))
            .rows[0].version
        )
      : 0
    if (anterior > VERSION_ESQUEMA)
      throw new ErrorNegocio('Esta base requiere una versión más reciente de la aplicación.')
    if (anterior > 0 && anterior < VERSION_ESQUEMA) {
      if (!this.opciones.respaldos)
        throw new ErrorNegocio(
          'No se pudo preparar el respaldo de seguridad. La actualización no se aplicó.'
        )
      await this.opciones.respaldos.crear(this.pool, 'pre_migracion')
    }
    await this.transaccion(async (db) => {
      await db.query(esquema)
      const version = await db.query(
        'SELECT version FROM ruizcacao.migraciones ORDER BY version DESC LIMIT 1'
      )
      if (version.rows[0]?.version > VERSION_ESQUEMA)
        throw new ErrorNegocio('Esta base requiere una versión más reciente de la aplicación.')
      if (!version.rowCount) {
        await db.query(migracionUno)
        await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(1)')
      }
      if ((version.rows[0]?.version ?? 0) < 2) {
        await db.query(sqlNormalizacion())
        await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(2)')
      }
      if ((version.rows[0]?.version ?? 0) < 3) {
        await db.query(migracionTres)
        await db.query('INSERT INTO ruizcacao.instalacion(id,installation_id) VALUES(1,$1)', [
          randomUUID()
        ])
        await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(3)')
      }
      if ((version.rows[0]?.version ?? 0) < 4) {
        await db.query(migracionCuatro)
        await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(4)')
      }
      if ((version.rows[0]?.version ?? 0) < 5) {
        await db.query(migracionCinco)
        const adminAnterior = (
          await db.query(
            'SELECT nombre,password_hash,fallos,bloqueado_hasta,actualizado_en FROM ruizcacao.administrador WHERE id=1'
          )
        ).rows[0]
        if (adminAnterior) {
          await db.query(
            "INSERT INTO ruizcacao.usuarios(id,nombre,password_hash,rol,activo,principal,fallos,bloqueado_hasta,actualizado_en) VALUES($1,$2,$3,'administrador',true,true,$4,$5,$6)",
            [
              randomUUID(),
              adminAnterior.nombre,
              adminAnterior.password_hash,
              adminAnterior.fallos,
              adminAnterior.bloqueado_hasta,
              adminAnterior.actualizado_en
            ]
          )
          await db.query(
            'UPDATE ruizcacao.auditoria a SET usuario_id=u.id FROM ruizcacao.usuarios u WHERE u.principal AND a.responsable=u.nombre'
          )
          await db.query(
            'UPDATE ruizcacao.eventos_jornada e SET usuario_id=u.id FROM ruizcacao.usuarios u WHERE u.principal AND e.responsable=u.nombre'
          )
        }
        await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(5)')
      }
      if ((version.rows[0]?.version ?? 0) < 6) {
        await db.query(migracionSeis)
        await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(6)')
      }
      if ((version.rows[0]?.version ?? 0) < 7) {
        await db.query(migracionSiete)
        await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(7)')
      }
      if ((version.rows[0]?.version ?? 0) < 8) {
        await db.query(migracionOcho)
        await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(8)')
      }
      if ((version.rows[0]?.version ?? 0) < 9) {
        await db.query(migracionNueve)
        await db.query('INSERT INTO ruizcacao.migraciones(version) VALUES(9)')
      }
      const interrumpidas = await db.query(
        'SELECT id FROM ruizcacao.sesiones WHERE cerrada_en IS NULL'
      )
      if (interrumpidas.rowCount) {
        const jornadas = (
          await db.query(
            "UPDATE ruizcacao.jornadas SET estado='interrumpida',cierre=NULL WHERE estado='activa' RETURNING fecha"
          )
        ).rows
        for (const jornada of jornadas)
          await db.query(
            "INSERT INTO ruizcacao.eventos_jornada(fecha_jornada,accion,responsable) VALUES($1,'interrupcion_detectada','Sistema')",
            [jornada.fecha]
          )
        await db.query(
          "UPDATE ruizcacao.sesiones SET cerrada_en=now(),cierre='interrupcion_detectada' WHERE cerrada_en IS NULL"
        )
        await this.aviso(
          db,
          'AutoRecover',
          'Se detectó un cierre inesperado. Las operaciones confirmadas se conservaron. Si había una jornada activa, quedó interrumpida y requiere tu contraseña para recuperarla. También puedes finalizarla explícitamente.'
        )
      }
      await db.query('INSERT INTO ruizcacao.sesiones(id) VALUES($1)', [this.sesion])
    })
  }
  async existeAdministrador(): Promise<boolean> {
    const r = await this.pool.query('SELECT id FROM ruizcacao.usuarios LIMIT 1')
    return !!r.rowCount
  }
  autenticado(): boolean {
    return this.usuario !== null
  }
  private exigirSesion(): string {
    if (!this.usuario || !this.usuarioId || this.cerrando)
      throw new ErrorNegocio('Inicia sesión para continuar.')
    return this.usuario
  }
  private exigirUsuario(): {
    id: string
    nombre: string
    rol: 'administrador' | 'operador'
    principal: boolean
  } {
    const nombre = this.exigirSesion()
    if (!this.usuarioId || !this.usuarioRol) throw new ErrorNegocio('Inicia sesión para continuar.')
    return {
      id: this.usuarioId,
      nombre,
      rol: this.usuarioRol,
      principal: this.usuarioPrincipal
    }
  }
  private exigirAdministrador(): void {
    if (this.exigirUsuario().rol !== 'administrador')
      throw new ErrorNegocio('Solo el administrador puede gestionar usuarios.')
  }
  private async aviso(
    db: PoolClient,
    titulo: string,
    mensaje: string,
    clave?: string,
    destino?: string
  ): Promise<void> {
    await db.query(
      'INSERT INTO ruizcacao.notificaciones(id,titulo,mensaje,evento_clave,destino) VALUES($1,$2,$3,$4,$5) ON CONFLICT(evento_clave) DO NOTHING',
      [randomUUID(), titulo, mensaje, clave ?? null, destino ?? null]
    )
  }
  private async auditoria(db: PoolClient, accion: string, detalle: unknown = {}): Promise<void> {
    await db.query(
      'INSERT INTO ruizcacao.auditoria(accion,responsable,detalle,usuario_id) VALUES($1,$2,$3,$4)',
      [accion, this.usuario ?? 'Sistema', JSON.stringify(detalle), this.usuarioId]
    )
  }
  async crearAdministrador(nombre: string, password: string): Promise<void> {
    validarPassword(password)
    if (typeof nombre !== 'string' || nombre.trim().length < 3 || nombre.length > 80)
      throw new ErrorNegocio('El nombre debe tener entre 3 y 80 caracteres.')
    const nombreLimpio = nombre.trim()
    const passwordHash = await hashSecreto(password)
    const usuarioId = randomUUID()
    await this.transaccion(async (db) => {
      if ((await db.query('SELECT id FROM ruizcacao.usuarios LIMIT 1')).rowCount)
        throw new ErrorNegocio('Ya existe un usuario. Inicia sesión para continuar.')
      await db.query(
        'INSERT INTO ruizcacao.administrador(id,nombre,password_hash) VALUES(1,$1,$2)',
        [nombreLimpio, passwordHash]
      )
      await db.query(
        "INSERT INTO ruizcacao.usuarios(id,nombre,password_hash,rol,activo,principal) VALUES($1,$2,$3,'administrador',true,true)",
        [usuarioId, nombreLimpio, passwordHash]
      )
      await this.auditoria(db, 'administrador_creado', { usuarioId, nombre: nombreLimpio })
      await this.aviso(
        db,
        'Usuario creado',
        'El acceso local está habilitado. Conserva tu usuario y contraseña.'
      )
    })
  }

  private async comprobar(
    nombre: string,
    password: string
  ): Promise<{
    id: string
    nombre: string
    rol: 'administrador' | 'operador'
    principal: boolean
  } | null> {
    return this.transaccion(async (db) => {
      const row = (
        await db.query(
          'SELECT * FROM ruizcacao.usuarios WHERE lower(nombre)=lower($1) FOR UPDATE',
          [typeof nombre === 'string' ? nombre.trim() : '']
        )
      ).rows[0]
      if (!row) return null
      if (!row.activo) throw new ErrorNegocio('Este usuario está desactivado.')
      if (row.bloqueado_hasta && new Date(row.bloqueado_hasta).getTime() > Date.now())
        throw new ErrorNegocio('Demasiados intentos. Intenta nuevamente en 15 minutos.')
      const valido = await verificarSecreto(password, row.password_hash)
      if (!valido) {
        await db.query(
          "UPDATE ruizcacao.usuarios SET fallos=fallos+1,bloqueado_hasta=CASE WHEN fallos+1>=5 THEN now()+interval '15 minutes' ELSE NULL END,actualizado_en=now() WHERE id=$1",
          [row.id]
        )
        await db.query(
          'INSERT INTO ruizcacao.auditoria(accion,responsable,detalle,usuario_id) VALUES($1,$2,$3,$4)',
          ['autenticacion_fallida', row.nombre, '{}', row.id]
        )
        return null
      }
      await db.query(
        'UPDATE ruizcacao.usuarios SET fallos=0,bloqueado_hasta=NULL,actualizado_en=now() WHERE id=$1',
        [row.id]
      )
      return {
        id: row.id,
        nombre: row.nombre,
        rol: row.rol,
        principal: Boolean(row.principal)
      }
    })
  }

  async login(nombre: string, password: string): Promise<EstadoAplicacion> {
    const usuario = await this.comprobar(nombre, password)
    if (!usuario) throw new ErrorNegocio('Usuario o contraseña incorrectos.')
    this.usuario = usuario.nombre
    this.usuarioId = usuario.id
    this.usuarioRol = usuario.rol
    this.usuarioPrincipal = usuario.principal
    return this.transaccion(async (db) => {
      await db.query('UPDATE ruizcacao.sesiones SET usuario_id=$2 WHERE id=$1', [
        this.sesion,
        usuario.id
      ])
      await this.auditoria(db, 'login')
      return this.estado(db)
    })
  }

  async cambiarPassword(actual: string, nueva: string): Promise<void> {
    const usuario = this.exigirUsuario()
    validarPassword(nueva)
    const hash = await hashSecreto(nueva)
    const error = await this.transaccion(async (db) => {
      this.exigirSesion()
      const row = (
        await db.query('SELECT * FROM ruizcacao.usuarios WHERE id=$1 FOR UPDATE', [usuario.id])
      ).rows[0]
      if (!row || !row.activo) return 'Inicia sesión para continuar.'
      if (row.bloqueado_hasta && new Date(row.bloqueado_hasta).getTime() > Date.now())
        return 'Demasiados intentos. Intenta nuevamente en 15 minutos.'
      if (!(await verificarSecreto(actual, row.password_hash))) {
        await db.query(
          "UPDATE ruizcacao.usuarios SET fallos=fallos+1,bloqueado_hasta=CASE WHEN fallos+1>=5 THEN now()+interval '15 minutes' ELSE NULL END,actualizado_en=now() WHERE id=$1",
          [usuario.id]
        )
        await this.auditoria(db, 'cambio_password_rechazado')
        return 'La contraseña actual no es correcta.'
      }
      await db.query(
        'UPDATE ruizcacao.usuarios SET password_hash=$2,fallos=0,bloqueado_hasta=NULL,actualizado_en=now() WHERE id=$1',
        [usuario.id, hash]
      )
      if (usuario.principal) {
        await db.query(
          'UPDATE ruizcacao.administrador SET password_hash=$1,fallos=0,bloqueado_hasta=NULL,actualizado_en=now() WHERE id=1',
          [hash]
        )
        await db.query(
          "UPDATE ruizcacao.solicitudes_recuperacion SET estado='invalidada' WHERE estado='activa'"
        )
      }
      await this.auditoria(db, 'password_cambiada')
      return null
    })
    if (error) throw new ErrorNegocio(error)
  }

  async crearUsuario(nombre: string, password: string): Promise<EstadoAplicacion> {
    this.exigirAdministrador()
    validarPassword(password)
    if (typeof nombre !== 'string' || nombre.trim().length < 3 || nombre.trim().length > 80)
      throw new ErrorNegocio('El nombre debe tener entre 3 y 80 caracteres.')
    const nombreLimpio = nombre.trim()
    const hash = await hashSecreto(password)
    return this.transaccion(async (db) => {
      this.exigirAdministrador()
      if (
        (
          await db.query('SELECT id FROM ruizcacao.usuarios WHERE lower(nombre)=lower($1)', [
            nombreLimpio
          ])
        ).rowCount
      )
        throw new ErrorNegocio('Ya existe un usuario con ese nombre.')
      const id = randomUUID()
      await db.query(
        "INSERT INTO ruizcacao.usuarios(id,nombre,password_hash,rol,activo,principal) VALUES($1,$2,$3,'operador',true,false)",
        [id, nombreLimpio, hash]
      )
      await this.auditoria(db, 'usuario_creado', { usuarioId: id, nombre: nombreLimpio })
      return this.estado(db)
    })
  }

  async cambiarEstadoUsuario(id: string, activo: boolean): Promise<EstadoAplicacion> {
    this.exigirAdministrador()
    if (!/^[0-9a-f-]{36}$/i.test(id) || typeof activo !== 'boolean')
      throw new ErrorNegocio('Usuario no válido.')
    return this.transaccion(async (db) => {
      this.exigirAdministrador()
      const row = (
        await db.query(
          'SELECT id,nombre,principal FROM ruizcacao.usuarios WHERE id=$1 FOR UPDATE',
          [id]
        )
      ).rows[0]
      if (!row) throw new ErrorNegocio('El usuario no existe.')
      if (row.principal) throw new ErrorNegocio('El usuario principal no se puede desactivar.')
      await db.query(
        'UPDATE ruizcacao.usuarios SET activo=$2,fallos=0,bloqueado_hasta=NULL,actualizado_en=now() WHERE id=$1',
        [id, activo]
      )
      await this.auditoria(db, activo ? 'usuario_activado' : 'usuario_desactivado', {
        usuarioId: id,
        nombre: row.nombre
      })
      return this.estado(db)
    })
  }

  async restablecerPasswordUsuario(id: string, nueva: string): Promise<void> {
    this.exigirAdministrador()
    validarPassword(nueva)
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErrorNegocio('Usuario no válido.')
    const hash = await hashSecreto(nueva)
    await this.transaccion(async (db) => {
      this.exigirAdministrador()
      const row = (
        await db.query(
          'SELECT id,nombre,principal FROM ruizcacao.usuarios WHERE id=$1 FOR UPDATE',
          [id]
        )
      ).rows[0]
      if (!row) throw new ErrorNegocio('El usuario no existe.')
      if (row.principal)
        throw new ErrorNegocio(
          'La contraseña del usuario principal se cambia desde su menú o mediante recuperación.'
        )
      await db.query(
        'UPDATE ruizcacao.usuarios SET password_hash=$2,fallos=0,bloqueado_hasta=NULL,actualizado_en=now() WHERE id=$1',
        [id, hash]
      )
      await this.auditoria(db, 'password_usuario_restablecida', {
        usuarioId: id,
        nombre: row.nombre
      })
    })
  }

  async solicitarRecuperacion(nombre: string): Promise<{ solicitud: string }> {
    if (!this.opciones.publica)
      throw new ErrorNegocio('La recuperación aún no está habilitada. Contacta con soporte.')
    clavePublica(this.opciones.publica)
    return this.transaccion(async (db) => {
      const control = (
        await db.query('SELECT * FROM ruizcacao.control_recuperacion WHERE id=1 FOR UPDATE')
      ).rows[0]
      if (control.bloqueado_hasta && new Date(control.bloqueado_hasta).getTime() > Date.now())
        throw new ErrorNegocio('Espera cinco minutos antes de intentar la recuperación nuevamente.')
      const solicitado = (
        await db.query(
          'SELECT nombre,principal FROM ruizcacao.usuarios WHERE lower(nombre)=lower($1)',
          [typeof nombre === 'string' ? nombre.trim() : '']
        )
      ).rows[0]
      if (!solicitado) throw new ErrorNegocio('Revisa tu usuario.')
      if (!solicitado.principal)
        throw new ErrorNegocio(
          'La recuperación de soporte corresponde al usuario principal. Solicita al administrador restablecer la contraseña de este operador.'
        )
      const admin = (await db.query('SELECT nombre FROM ruizcacao.administrador WHERE id=1'))
        .rows[0]
      if (!admin || admin.nombre !== solicitado.nombre) throw new ErrorNegocio('Revisa tu usuario.')
      const installation_id = (
        await db.query('SELECT installation_id FROM ruizcacao.instalacion WHERE id=1')
      ).rows[0].installation_id
      const solicitud = nuevaSolicitud(installation_id)
      await db.query(
        "UPDATE ruizcacao.solicitudes_recuperacion SET estado='invalidada' WHERE administrador_id=1 AND estado='activa'"
      )
      await db.query(
        "INSERT INTO ruizcacao.solicitudes_recuperacion(request_id,administrador_id,installation_id,version,nonce,proposito,estado) VALUES($1,1,$2,1,$3,'recovery_password','activa')",
        [solicitud.request_id, installation_id, solicitud.nonce]
      )
      await this.auditoria(db, 'solicitud_recuperacion_creada')
      return { solicitud: tokenSolicitud(solicitud) }
    })
  }
  async recuperar(nombre: string, autorizacion: string, password: string): Promise<void> {
    validarPassword(password)
    if (!this.opciones.publica)
      throw new ErrorNegocio('La recuperación aún no está habilitada. Contacta con soporte.')
    const hash = await hashSecreto(password)
    const error = await this.transaccion(async (db) => {
      const control = (
        await db.query('SELECT * FROM ruizcacao.control_recuperacion WHERE id=1 FOR UPDATE')
      ).rows[0]
      if (control.bloqueado_hasta && new Date(control.bloqueado_hasta).getTime() > Date.now()) {
        await this.auditoria(db, 'recuperacion_fallida')
        return 'Espera cinco minutos antes de intentar la recuperación nuevamente.'
      }
      let solicitud
      try {
        solicitud = verificarAutorizacion(autorizacion, this.opciones.publica!)
      } catch {
        solicitud = null
      }
      const admin = (await db.query('SELECT nombre FROM ruizcacao.administrador WHERE id=1'))
        .rows[0]
      const row = solicitud
        ? (
            await db.query(
              "SELECT * FROM ruizcacao.solicitudes_recuperacion WHERE request_id=$1 AND estado='activa' FOR UPDATE",
              [solicitud.request_id]
            )
          ).rows[0]
        : null
      if (
        !row ||
        !admin ||
        admin.nombre !== nombre ||
        row.installation_id !== solicitud?.installation_id ||
        row.nonce !== solicitud?.nonce ||
        row.version !== solicitud?.version ||
        row.proposito !== solicitud?.purpose
      ) {
        await db.query(
          "UPDATE ruizcacao.control_recuperacion SET fallos=fallos+1,bloqueado_hasta=CASE WHEN fallos+1>=5 THEN now()+interval '5 minutes' ELSE NULL END WHERE id=1"
        )
        await this.auditoria(db, 'recuperacion_fallida')
        return 'La autorización no es válida o ya fue utilizada. Revisa la solicitud y el código de soporte.'
      }
      await db.query(
        'UPDATE ruizcacao.administrador SET password_hash=$1,fallos=0,bloqueado_hasta=NULL,actualizado_en=now() WHERE id=1',
        [hash]
      )
      await db.query(
        'UPDATE ruizcacao.usuarios SET password_hash=$1,fallos=0,bloqueado_hasta=NULL,actualizado_en=now() WHERE principal=true',
        [hash]
      )
      await db.query(
        "UPDATE ruizcacao.solicitudes_recuperacion SET estado='utilizada',utilizada_en=now() WHERE request_id=$1",
        [row.request_id]
      )
      await db.query(
        'UPDATE ruizcacao.control_recuperacion SET fallos=0,bloqueado_hasta=NULL WHERE id=1'
      )
      await this.cerrarJornada(db, 'recuperacion_password', nombre, true)
      await this.auditoria(db, 'password_recuperada')
      await this.aviso(
        db,
        'Acceso recuperado',
        'Se cambió la contraseña mediante autorización de soporte.',
        'recuperacion:' + row.request_id,
        'inicio'
      )
      return null
    })
    if (error) throw new ErrorNegocio(error)
    this.usuario = null
    this.usuarioId = null
    this.usuarioRol = null
    this.usuarioPrincipal = false
    await this.respaldarCierre()
  }
  async respaldarManual(): Promise<void> {
    if (!this.opciones.respaldos)
      throw new ErrorNegocio('El respaldo no está disponible. Contacta con soporte.')
    await this.opciones.respaldos.crear(this.pool, 'manual')
  }
  private async respaldarCierre(): Promise<void> {
    if (!this.opciones.respaldos) return
    const row = (
      await this.pool.query(
        "SELECT fecha::text FROM ruizcacao.jornadas WHERE estado='finalizada' ORDER BY cierre DESC LIMIT 1"
      )
    ).rows[0]
    if (!row) return
    try {
      await this.opciones.respaldos.crear(this.pool, 'automatico', row.fecha)
    } catch (error) {
      traducirError(error, { modulo: 'respaldos', operacion: 'automatico' })
      await this.transaccion(async (db) => {
        await this.auditoria(db, 'respaldo_fallido', { tipo: 'automatico' })
        await this.aviso(
          db,
          'Respaldo pendiente',
          'La jornada se cerró, pero no se pudo crear su respaldo. Contacta con soporte.',
          'respaldo_fallido:' + row.fecha,
          'inicio'
        )
      }).catch(() => {})
    }
  }
  private async datos(db: PoolClient): Promise<Snapshot> {
    const result = estadoInicial()
    await leerEntidades(db, result)
    const config = (
      await db.query('SELECT ultimo_factor_usado FROM ruizcacao.configuracion WHERE id=1')
    ).rows[0]
    if (config) result.ultimoFactorUsado = Number(config.ultimo_factor_usado)
    for (const row of (await db.query('SELECT * FROM ruizcacao.existencias')).rows) {
      const producto = row.producto as keyof typeof result.stock
      result.stock[producto] = Number(row.cantidad_qq)
      result.costoUnitarioPromedio[producto] = Number(row.costo_unitario_promedio)
    }
    const jornada = (
      await db.query(
        "SELECT fecha::text,estado,apertura,cierre FROM ruizcacao.jornadas WHERE estado IN ('activa','interrumpida') OR fecha=$1::date ORDER BY (estado IN ('activa','interrumpida')) DESC LIMIT 1",
        [hoy()]
      )
    ).rows[0]
    result.jornada = jornada
      ? {
          fecha: jornada.fecha,
          estado: jornada.estado,
          horaInicio: hora(jornada.apertura),
          horaFin: jornada.cierre ? hora(jornada.cierre) : null
        }
      : { estado: 'no_iniciada', fecha: hoy(), horaInicio: null, horaFin: null }
    return result
  }
  private async estado(db: PoolClient): Promise<EstadoAplicacion> {
    const datos = await this.datos(db)
    const avisos = (
      await db.query(
        'SELECT id,titulo,mensaje,fecha,leida,destino FROM ruizcacao.notificaciones WHERE NOT leida OR id IN (SELECT id FROM ruizcacao.notificaciones ORDER BY fecha DESC LIMIT 200) ORDER BY fecha DESC'
      )
    ).rows.map((r) => ({ ...r, fecha: r.fecha.toISOString() }))
    const umbralesStock = Object.fromEntries(
      (await db.query('SELECT nombre,umbral_stock FROM ruizcacao.productos')).rows.map((r) => [
        r.nombre,
        r.umbral_stock === null ? null : Number(r.umbral_stock)
      ])
    ) as EstadoAplicacion['umbralesStock']
    const usuarios = (
      await db.query(
        'SELECT id,nombre,rol,activo,principal,creado_en FROM ruizcacao.usuarios ORDER BY principal DESC, lower(nombre)'
      )
    ).rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      rol: row.rol,
      activo: Boolean(row.activo),
      principal: Boolean(row.principal),
      creadoEn: row.creado_en.toISOString()
    }))
    const actual = this.usuarioId
      ? usuarios.find((usuario) => usuario.id === this.usuarioId)
      : undefined
    const stockInicial = (
      await db.query(
        'SELECT stock_inicial_registrado,stock_inicial_registrado_en FROM ruizcacao.configuracion WHERE id=1'
      )
    ).rows[0]
    return {
      datos,
      avisos,
      umbralesStock,
      stockInicialRegistrado: Boolean(stockInicial?.stock_inicial_registrado),
      stockInicialRegistradoEn: stockInicial?.stock_inicial_registrado_en
        ? stockInicial.stock_inicial_registrado_en.toISOString()
        : null,
      administrador: this.usuario ?? '',
      usuarioActual: actual
        ? {
            id: actual.id,
            nombre: actual.nombre,
            rol: actual.rol,
            principal: actual.principal
          }
        : null,
      usuarios
    }
  }
  async cargar(): Promise<EstadoAplicacion> {
    this.exigirSesion()
    return this.transaccion((db) => this.estado(db))
  }

  async historialCombinado(filtro: FiltroListado): Promise<Listados['historialCombinado']> {
    this.exigirSesion()
    return this.transaccion((db) => {
      this.exigirSesion()
      return consultarListado(db, 'historialCombinado', filtro)
    }, true)
  }
  async listadoGastos(filtro: FiltroListado): Promise<Listados['listadoGastos']> {
    this.exigirSesion()
    return this.transaccion((db) => {
      this.exigirSesion()
      return consultarListado(db, 'listadoGastos', filtro)
    }, true)
  }
  async resumenGastos(filtro: FiltroListado): Promise<Listados['resumenGastos']> {
    this.exigirSesion()
    return this.transaccion((db) => {
      this.exigirSesion()
      return consultarListado(db, 'resumenGastos', filtro)
    }, true)
  }
  async reportePeriodo(filtro: FiltroListado): Promise<Listados['reportePeriodo']> {
    this.exigirSesion()
    return this.transaccion((db) => {
      this.exigirSesion()
      return consultarListado(db, 'reportePeriodo', filtro)
    }, true)
  }
  async documentoReporte(
    filtro: FiltroListado,
    tipo: 'diario' | 'semanal' | 'mensual'
  ): Promise<{ html: string; nombreArchivo: string }> {
    this.exigirSesion()
    return this.transaccion((db) => {
      this.exigirSesion()
      return reporteCompleto(db, filtro, tipo)
    }, true)
  }
  async historialCompras(filtro: FiltroHistorialOperaciones): Promise<PaginaCompras> {
    this.exigirSesion()
    return this.transaccion((db) => {
      this.exigirSesion()
      return consultarHistorialCompras(db, filtro)
    }, true)
  }
  async historialVentas(filtro: FiltroHistorialOperaciones): Promise<PaginaVentas> {
    this.exigirSesion()
    return this.transaccion((db) => {
      this.exigirSesion()
      return consultarHistorialVentas(db, filtro)
    }, true)
  }
  async historialStock(filtro: FiltroHistorialStock): Promise<PaginaHistorialStock> {
    this.exigirSesion()
    return this.transaccion((db) => {
      this.exigirSesion()
      return consultarHistorialStock(db, filtro)
    }, true)
  }

  async registrarStockInicial(input: StockInicialInput): Promise<EstadoAplicacion> {
    const usuario = this.exigirUsuario()
    this.exigirAdministrador()
    if (!input || typeof input !== 'object')
      throw new ErrorNegocio('Datos de stock inicial no válidos.')

    const observacion = typeof input.observacion === 'string' ? input.observacion.trim() : ''
    if (observacion.length > 500)
      throw new ErrorNegocio('La observación no puede superar 500 caracteres.')

    const preparados = PRODUCTOS.map((producto) => {
      const cantidad = Number(input.cantidades?.[producto])
      const costoCrudo = input.costosUnitarios?.[producto]
      const costo = costoCrudo === null || costoCrudo === undefined ? null : Number(costoCrudo)
      if (!Number.isFinite(cantidad) || cantidad < 0)
        throw new ErrorNegocio(
          'Las cantidades de stock inicial deben ser números iguales o mayores a 0.'
        )
      if (costo !== null && (!Number.isFinite(costo) || costo < 0))
        throw new ErrorNegocio('Los costos iniciales deben ser números iguales o mayores a 0.')
      return { producto, cantidad: Math.round(cantidad * 100) / 100, costo }
    })

    if (!preparados.some((item) => item.cantidad > 0))
      throw new ErrorNegocio(
        'Ingresa al menos una cantidad mayor a 0 para registrar el stock inicial.'
      )

    return this.transaccion(async (db) => {
      this.exigirAdministrador()
      const control = (
        await db.query(
          'SELECT stock_inicial_registrado FROM ruizcacao.configuracion WHERE id=1 FOR UPDATE'
        )
      ).rows[0]
      if (control?.stock_inicial_registrado)
        throw new ErrorNegocio(
          'El stock inicial ya fue registrado y no se puede cargar nuevamente.'
        )

      const fecha = hoy()
      for (const item of preparados) {
        if (item.cantidad <= 0) continue
        const actual = (
          await db.query(
            'SELECT cantidad_qq,costo_unitario_promedio FROM ruizcacao.existencias WHERE producto=$1 FOR UPDATE',
            [item.producto]
          )
        ).rows[0]
        if (!actual) throw new ErrorNegocio('No se encontró el producto ' + item.producto + '.')

        const cantidadAnterior = Number(actual.cantidad_qq)
        const costoAnterior = Number(actual.costo_unitario_promedio)
        const cantidadNueva = Math.round((cantidadAnterior + item.cantidad) * 100) / 100
        let costoNuevo = costoAnterior
        if (item.costo !== null) {
          costoNuevo =
            cantidadNueva > 0
              ? (cantidadAnterior * costoAnterior + item.cantidad * item.costo) / cantidadNueva
              : 0
          costoNuevo = Math.round(costoNuevo * 1_000_000) / 1_000_000
        }

        await db.query(
          'UPDATE ruizcacao.existencias SET cantidad_qq=$2,costo_unitario_promedio=$3 WHERE producto=$1',
          [item.producto, cantidadNueva, costoNuevo]
        )
        await db.query(
          `INSERT INTO ruizcacao.movimientos_stock(
            id,fecha,fecha_hora_registro,tipo,producto,entrada_qq,salida_qq,stock_resultante,
            detalle,observacion,usuario_id,usuario_nombre
          ) VALUES($1,$2,now(),'Stock inicial',$3,$4,0,$5,$6,$7,$8,$9)`,
          [
            randomUUID(),
            fecha,
            item.producto,
            item.cantidad,
            cantidadNueva,
            'Inventario existente previo al uso de RuizCacao Manager',
            observacion || null,
            usuario.id,
            usuario.nombre
          ]
        )
      }

      await db.query(
        'UPDATE ruizcacao.configuracion SET stock_inicial_registrado=true,stock_inicial_registrado_en=now(),stock_inicial_usuario_id=$1 WHERE id=1',
        [usuario.id]
      )
      await this.auditoria(db, 'stock_inicial_registrado', {
        cantidades: Object.fromEntries(preparados.map((item) => [item.producto, item.cantidad]))
      })
      await this.aviso(
        db,
        'Stock inicial registrado',
        'El inventario existente se incorporó sin generar compras, gastos ni cuentas por pagar.',
        'stock_inicial',
        'stock'
      )
      return this.estado(db)
    })
  }

  private async guardar(db: PoolClient, antes: Snapshot, despues: Snapshot): Promise<void> {
    for (const key of Object.keys(tablas)) {
      const registros = despues[key as keyof typeof tablas] as { id: string | number }[]
      const originales = antes[key as keyof typeof tablas] as { id: string | number }[]
      const presentes = new Set(registros.map((registro) => registro.id))
      const anteriores = new Map(originales.map((r) => [String(r.id), JSON.stringify(r)]))
      for (const registro of registros) {
        const esNuevo = !anteriores.has(String(registro.id))
        if (
          esNuevo &&
          this.usuarioId &&
          this.usuario &&
          [
            'compras',
            'ventas',
            'cuentas',
            'movimientosCuenta',
            'movimientosStock',
            'gastos'
          ].includes(key)
        ) {
          const auditable = registro as Record<string, unknown>
          auditable.usuarioId ??= this.usuarioId
          auditable.usuarioNombre ??= this.usuario
        }
        const json = JSON.stringify(registro)
        if (anteriores.get(String(registro.id)) === json) continue
        await guardarRegistro(db, key as Entidad, registro)
      }
      for (const registro of originales) {
        if (!presentes.has(registro.id)) {
          if (key !== 'gastos') throw new ErrorNegocio('Este registro no se puede eliminar.')
          await this.auditoria(db, 'gasto_eliminado', registro)
          await db.query(`DELETE FROM ruizcacao.${tablas[key as Entidad]} WHERE id=$1`, [
            String(registro.id)
          ])
        }
      }
    }
    await db.query('UPDATE ruizcacao.configuracion SET ultimo_factor_usado=$1 WHERE id=1', [
      despues.ultimoFactorUsado
    ])
    for (const producto of Object.keys(despues.stock) as (keyof typeof despues.stock)[])
      await db.query(
        'UPDATE ruizcacao.existencias SET cantidad_qq=$2,costo_unitario_promedio=$3 WHERE producto=$1',
        [producto, despues.stock[producto], despues.costoUnitarioPromedio[producto]]
      )
  }
  async anularOperacion(
    solicitud: string,
    tipo: 'compra' | 'venta',
    id: string,
    motivo: string,
    password: string
  ): Promise<EstadoAplicacion> {
    const usuario = this.exigirUsuario()
    if (typeof motivo !== 'string' || !motivo.trim())
      throw new ErrorNegocio('Ingresa el motivo de la anulación.')
    if (motivo.trim().length > 500)
      throw new ErrorNegocio('El motivo no puede superar 500 caracteres.')
    if (
      !['compra', 'venta'].includes(tipo) ||
      typeof id !== 'string' ||
      !id ||
      id.length > 200 ||
      typeof solicitud !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(solicitud)
    )
      throw new ErrorNegocio('Selecciona una compra o venta válida.')
    if (
      typeof password !== 'string' ||
      (await this.comprobar(usuario.nombre, password))?.id !== usuario.id
    )
      throw new ErrorNegocio('La contraseña ingresada no es correcta.')
    const firma = createHash('sha256')
      .update(JSON.stringify({ tipo, id, motivo: motivo.trim(), usuario: usuario.id }))
      .digest('hex')
    return this.transaccion(async (db) => {
      if (this.exigirUsuario().id !== usuario.id)
        throw new ErrorNegocio('Inicia sesión para continuar.')
      const actual = (
        await db.query(
          'SELECT activo,password_hash FROM ruizcacao.usuarios WHERE id=$1 FOR UPDATE',
          [usuario.id]
        )
      ).rows[0]
      if (!actual?.activo || !(await verificarSecreto(password, actual.password_hash)))
        throw new ErrorNegocio('La contraseña ingresada no es correcta.')
      const previa = (
        await db.query('SELECT firma,usuario_id FROM ruizcacao.operaciones WHERE id=$1', [
          solicitud
        ])
      ).rows[0]
      if (previa) {
        if (previa.firma !== firma || previa.usuario_id !== usuario.id)
          throw new ErrorNegocio('No se pudo confirmar esta solicitud. Vuelve a intentarlo.')
        return this.estado(db)
      }
      const antes = await this.datos(db)
      const despues = aplicarAnulacion(
        antes,
        tipo,
        id,
        motivo,
        usuario,
        hoy(),
        new Date().toISOString(),
        randomUUID
      )
      await this.guardar(db, antes, despues)
      await db.query(
        'INSERT INTO ruizcacao.operaciones(id,comando,firma,resultado,usuario_id) VALUES($1,$2,$3,$4,$5)',
        [
          solicitud,
          tipo === 'compra' ? 'anularCompra' : 'anularVenta',
          firma,
          JSON.stringify({ id }),
          usuario.id
        ]
      )
      await this.auditoria(db, tipo === 'compra' ? 'compra_anulada' : 'venta_anulada', {
        operacion: id,
        motivo: motivo.trim(),
        solicitud
      })
      return this.estado(db)
    })
  }

  async ejecutar(
    id: string,
    comando: Comando,
    args: unknown[]
  ): Promise<{ estado: EstadoAplicacion; resultado: unknown }> {
    this.exigirSesion()
    if (
      !/^[0-9a-f-]{36}$/i.test(id) ||
      !comandos.includes(comando) ||
      !Array.isArray(args) ||
      args.length > 3 ||
      JSON.stringify(args).length > 30000
    )
      throw new ErrorNegocio('Operación no válida.')
    args = validarArgumentos(comando, args)
    const firma = createHash('sha256').update(JSON.stringify({ comando, args })).digest('hex')
    return this.transaccion(async (db) => {
      this.exigirSesion()
      const previa = (
        await db.query('SELECT firma,resultado FROM ruizcacao.operaciones WHERE id=$1', [id])
      ).rows[0]
      if (previa) {
        if (previa.firma !== firma)
          throw new ErrorNegocio('La referencia ya pertenece a otra operación.')
        return { estado: await this.estado(db), resultado: previa.resultado }
      }
      const antes = await this.datos(db),
        dominio = crearDominio(antes)
      if (antes.jornada.estado === 'interrumpida')
        throw new ErrorNegocio(
          'Recupera con contraseña o finaliza la jornada interrumpida antes de registrar operaciones.'
        )
      const fn = dominio.value[comando] as (...values: unknown[]) => unknown
      const resultado = fn(...args) ?? null
      const despues = dominio.snapshot()
      for (const cantidad of Object.values(despues.stock))
        if (!Number.isFinite(cantidad) || cantidad < 0)
          throw new ErrorNegocio('La operación deja un stock inválido.')
      await this.guardar(db, antes, despues)
      await db.query(
        'INSERT INTO ruizcacao.operaciones(id,comando,firma,resultado,usuario_id) VALUES($1,$2,$3,$4,$5)',
        [id, comando, firma, JSON.stringify(resultado), this.usuarioId]
      )
      await this.auditoria(db, comando, { operacion: id })
      if (comando === 'registrarAbono' && (resultado as { cerrada?: boolean })?.cerrada)
        await this.aviso(
          db,
          'Cuenta saldada',
          'Un pago completó el saldo de una cuenta. Consulta su historial en Cuentas.'
        )
      if (comando === 'registrarVenta' || comando === 'registrarMerma')
        for (const producto of Object.keys(despues.stock)) {
          if (
            antes.stock[producto as keyof typeof antes.stock] > 0 &&
            despues.stock[producto as keyof typeof despues.stock] === 0
          )
            await this.aviso(db, 'Producto sin stock', producto + ' llegó a cero existencias.')
        }
      for (const p of (
        await db.query(
          'SELECT nombre,umbral_stock FROM ruizcacao.productos WHERE umbral_stock IS NOT NULL'
        )
      ).rows) {
        const producto = p.nombre as keyof typeof despues.stock,
          umbral = Number(p.umbral_stock)
        if (
          antes.stock[producto] > umbral &&
          despues.stock[producto] <= umbral &&
          despues.stock[producto] > 0
        )
          await this.aviso(
            db,
            'Stock bajo',
            producto + ' alcanzó el umbral configurado de ' + umbral + ' qq.',
            'stock_bajo:' + id + ':' + producto,
            'stock'
          )
      }
      return { estado: await this.estado(db), resultado }
    })
  }
  private async cerrarJornada(
    db: PoolClient,
    accion: string,
    responsable: string,
    incluirInterrumpida = false
  ): Promise<void> {
    const rows = await db.query(
      "UPDATE ruizcacao.jornadas SET estado='finalizada',cierre=now() WHERE estado='activa' OR ($1::boolean AND estado='interrumpida') RETURNING fecha",
      [incluirInterrumpida]
    )
    for (const row of rows.rows) {
      const evento = (
        await db.query(
          'INSERT INTO ruizcacao.eventos_jornada(fecha_jornada,accion,responsable,usuario_id) VALUES($1,$2,$3,$4) RETURNING id',
          [row.fecha, accion, responsable, this.usuarioId]
        )
      ).rows[0].id
      await this.aviso(
        db,
        'Jornada cerrada',
        'La jornada se cerró correctamente.',
        'cierre:' + evento,
        'inicio'
      )
      await this.aviso(
        db,
        'Resumen de jornada disponible',
        'Consulta los cobros, pagos y gastos de la jornada cerrada.',
        'resumen:' + evento,
        'consultas'
      )
      const pendientes = (
        await db.query(
          "SELECT id,monto_total-monto_aplicado AS saldo FROM ruizcacao.cuentas WHERE estado IN ('pendiente','parcial') AND monto_total>monto_aplicado ORDER BY id"
        )
      ).rows
      if (pendientes.length)
        await this.aviso(
          db,
          'Cuentas con saldo pendiente',
          pendientes.length +
            ' cuentas permanecen abiertas. Sus saldos no cambiaron al cerrar la jornada.',
          'pendientes:' +
            String(row.fecha) +
            ':' +
            createHash('sha256').update(JSON.stringify(pendientes)).digest('hex'),
          'cuentas'
        )
    }
  }

  async jornada(accion: 'abrir' | 'cerrar' | 'reabrir', password = ''): Promise<EstadoAplicacion> {
    const usuario = this.exigirSesion()
    if (!['abrir', 'cerrar', 'reabrir'].includes(accion))
      throw new ErrorNegocio('Acción no válida.')
    if (accion === 'reabrir' && !(await this.comprobar(usuario, password)))
      throw new ErrorNegocio('Contraseña incorrecta.')
    await this.transaccion(async (db) => {
      this.exigirSesion()
      const activa = (
        await db.query(
          "SELECT fecha::text,estado FROM ruizcacao.jornadas WHERE estado IN ('activa','interrumpida') FOR UPDATE"
        )
      ).rows[0]
      const actual = (
        await db.query('SELECT estado FROM ruizcacao.jornadas WHERE fecha=$1::date FOR UPDATE', [
          hoy()
        ])
      ).rows[0]
      if (accion === 'cerrar') {
        if (!activa) throw new ErrorNegocio('No hay jornada activa.')
        await this.cerrarJornada(
          db,
          activa.estado === 'interrumpida' ? 'cierre_interrupcion_autorizado' : 'cierre_manual',
          usuario,
          true
        )
      } else {
        if (
          activa &&
          !(accion === 'reabrir' && activa.estado === 'interrumpida' && activa.fecha === hoy())
        )
          throw new ErrorNegocio(
            activa.estado === 'interrumpida'
              ? 'Finaliza la jornada interrumpida antes de continuar.'
              : 'Ya existe una jornada activa.'
          )
        if (accion === 'abrir') {
          if (actual)
            throw new ErrorNegocio('La jornada de hoy ya existe; utiliza Reabrir jornada.')
          await db.query("INSERT INTO ruizcacao.jornadas(fecha,estado) VALUES($1,'activa')", [
            hoy()
          ])
        } else {
          if (!actual || !['finalizada', 'interrumpida'].includes(actual.estado))
            throw new ErrorNegocio('Solo se puede reabrir una jornada cerrada del día actual.')
          await db.query(
            "UPDATE ruizcacao.jornadas SET estado='activa',cierre=NULL WHERE fecha=$1",
            [hoy()]
          )
        }
        await db.query(
          'INSERT INTO ruizcacao.eventos_jornada(fecha_jornada,accion,responsable,usuario_id) VALUES($1,$2,$3,$4)',
          [
            hoy(),
            actual?.estado === 'interrumpida' ? 'recuperacion_autorizada' : accion,
            usuario,
            this.usuarioId
          ]
        )
      }
      if (accion !== 'cerrar')
        await this.aviso(
          db,
          'Jornada ' + (accion === 'abrir' ? 'abierta' : 'reabierta'),
          'Acción autorizada por ' + usuario + '.'
        )
      return this.estado(db)
    })
    if (accion === 'cerrar') await this.respaldarCierre()
    return this.cargar()
  }
  async configurarUmbralStock(producto: string, valor: number | null): Promise<EstadoAplicacion> {
    this.exigirSesion()
    if (
      !PRODUCTOS.includes(producto as (typeof PRODUCTOS)[number]) ||
      (valor !== null && (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0))
    )
      throw new ErrorNegocio('Selecciona un producto y un umbral válido, o desactiva el aviso.')
    return this.transaccion(async (db) => {
      const anterior = (
        await db.query('SELECT umbral_stock FROM ruizcacao.productos WHERE nombre=$1', [producto])
      ).rows[0]
      if ((anterior.umbral_stock === null ? null : Number(anterior.umbral_stock)) === valor)
        return this.estado(db)
      await db.query('UPDATE ruizcacao.productos SET umbral_stock=$2 WHERE nombre=$1', [
        producto,
        valor
      ])
      await this.auditoria(db, 'umbral_stock_configurado', { producto, umbral: valor })
      const cantidad = Number(
        (
          await db.query('SELECT cantidad_qq FROM ruizcacao.existencias WHERE producto=$1', [
            producto
          ])
        ).rows[0].cantidad_qq
      )
      if (valor !== null && cantidad > 0 && cantidad <= valor)
        await this.aviso(
          db,
          'Stock bajo',
          producto + ' está por debajo o en el umbral configurado.',
          'umbral:' + randomUUID(),
          'stock'
        )
      return this.estado(db)
    })
  }
  async leerAviso(id: string): Promise<EstadoAplicacion> {
    this.exigirSesion()
    return this.transaccion(async (db) => {
      await db.query('UPDATE ruizcacao.notificaciones SET leida=true WHERE id=$1', [id])
      return this.estado(db)
    })
  }
  async logout(): Promise<void> {
    const usuario = this.exigirSesion()
    await this.transaccion(async (db) => {
      await this.cerrarJornada(db, 'cierre_sesion', usuario)
      await this.auditoria(db, 'logout')
      await db.query("UPDATE ruizcacao.sesiones SET cerrada_en=now(),cierre='logout' WHERE id=$1", [
        this.sesion
      ])
      this.sesion = randomUUID()
      await db.query('INSERT INTO ruizcacao.sesiones(id) VALUES($1)', [this.sesion])
    })
    this.usuario = null
    this.usuarioId = null
    this.usuarioRol = null
    this.usuarioPrincipal = false
    await this.respaldarCierre()
  }
  async cerrar(): Promise<void> {
    if (this.cerrando) return
    this.cerrando = true
    try {
      await this.transaccion(async (db) => {
        await this.cerrarJornada(db, 'cierre_aplicacion', this.usuario ?? 'Sistema')
        await db.query(
          "UPDATE ruizcacao.sesiones SET cerrada_en=now(),cierre='normal' WHERE id=$1",
          [this.sesion]
        )
      })
      await this.respaldarCierre()
      await this.desconectar()
    } catch (e) {
      this.cerrando = false
      throw e
    }
  }
  async desconectar(): Promise<void> {
    if (this.candado) {
      await this.candado.query('SELECT pg_advisory_unlock(7302027)').catch(() => {})
      this.candado.release()
      this.candado = undefined
    }
    await this.pool.end()
  }
}
