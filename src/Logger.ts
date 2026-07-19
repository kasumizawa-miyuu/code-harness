import { ILogger } from './types.js'

export function maskKey(key: string, visible = 4): string {
  if (!key || key.length <= visible) return key
  return key.slice(0, visible) + '...' + key.slice(-4)
}

export function createLogger(verbose: boolean): ILogger {
  function log(level: string, msg: string) {
    const ts = new Date().toISOString()
    const masked = msg.replace(/(sk-|sk-ant-)[a-zA-Z0-9]{10,}/g, (m) => maskKey(m))
    console.log(`[${ts}] [${level}] ${masked}`)
  }

  return {
    info: (msg: string) => log('INFO', msg),
    warn: (msg: string) => log('WARN', msg),
    error: (msg: string) => log('ERROR', msg),
    debug: (msg: string) => { if (verbose) log('DEBUG', msg) },
  }
}