// Exporta solo artefactos de prueba, sin diálogos ni escrituras comerciales.
const { app, BrowserWindow } = require('electron'),
  fs = require('node:fs/promises'),
  { createHash } = require('node:crypto')
const { load, root } = require('../tests/loader.cjs'),
  { conexionDesarrollador } = require('./conexion-desarrollador.cjs')
async function main() {
  const { config } = await conexionDesarrollador(),
    { BaseLocal } = load(root + '/src/main/database/base.ts'),
    { reporteCompleto } = load(root + '/src/main/database/listados.ts')
  const base = new BaseLocal(config),
    db = await base.pool.connect(),
    evidencia = []
  let ventana
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await db.query('SET LOCAL idle_in_transaction_session_timeout = 0')
    for (const [tipo, desde, hasta] of [
      ['diario', '2026-01-05', '2026-01-05'],
      ['semanal', '2026-01-05', '2026-01-11'],
      ['mensual', '2026-01-01', '2026-01-31']
    ]) {
      const doc = await reporteCompleto(db, { desde, hasta }, tipo)
      ventana = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          javascript: false
        }
      })
      await ventana.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(doc.html))
      const pdf = await ventana.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      })
      if (pdf.subarray(0, 5).toString() !== '%PDF-') throw Error('PDF inválido')
      const paginas = (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length
      if (!paginas) throw Error('PDF sin páginas')
      const archivo = 'docs/evidencias-escalabilidad/PDF_etapa04_' + tipo + '.pdf'
      await fs.writeFile(root + '/' + archivo, pdf)
      evidencia.push({
        tipo,
        desde,
        hasta,
        archivo,
        paginas,
        bytes: pdf.length,
        filasHTML: (doc.html.match(/<tr>/g) || []).length - 1,
        sha256: createHash('sha256').update(pdf).digest('hex')
      })
      ventana.destroy()
      ventana = null
      console.log(tipo + ': ' + paginas + ' páginas')
    }
    await fs.writeFile(
      root + '/docs/evidencias-escalabilidad/pdf-etapa04-2026-10-02.json',
      JSON.stringify(evidencia, null, 2)
    )
  } finally {
    ventana?.destroy()
    await db.query('ROLLBACK')
    db.release()
    await base.pool.end()
  }
}
app.setName('RuizCacao Manager')
app.on('window-all-closed', () => {})
app
  .whenReady()
  .then(main)
  .then(() => app.quit())
  .catch((e) => {
    console.error(e.message)
    app.exit(1)
  })
