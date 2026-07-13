import { ILogger } from './types.js'

export function createLogger(verbose: boolean): ILogger {
  function log(level: string, msg: string) {
    const ts = new Date().toISOString()
    console.log(`[${ts}] [${level}] ${msg}`)
  }

  return {
    info: (msg: string) => log('INFO', msg),
    warn: (msg: string) => log('WARN', msg),
    error: (msg: string) => log('ERROR', msg),
    debug: (msg: string) => { if (verbose) log('DEBUG', msg) },
  }
}