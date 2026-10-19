// Bridge solo para el harness diagnóstico bajo ELECTRON_RUN_AS_NODE.
// No forma parte del producto ni reemplaza las validaciones PostgreSQL.
const Module = require('node:module')
const path = require('node:path')
const crypto = require('node:crypto')
const originalLoad = Module._load
const key = crypto.randomBytes(32)
const paths = new Map()
const app = {
  whenReady: () => Promise.resolve(),
  setPath: (name, value) => paths.set(name, value),
  getPath: (name) => paths.get(name),
  exit: (code = 0) => process.exit(code)
}
const safeStorage = {
  encryptString(value) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), data])
  },
  decryptString(buffer) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12))
    decipher.setAuthTag(buffer.subarray(12, 28))
    return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8')
  }
}
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return { app, safeStorage }
  return originalLoad.call(this, request, parent, isMain)
}
process.resourcesPath = path.resolve(__dirname, '../vendor')
