import { IMemory } from './types.js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const MAX_ITEMS = 20

export function createMemory(filePath: string): IMemory {
  let store: Record<string, unknown> = {}
  const keys: string[] = []

  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(raw)
      store = data.store || {}
      keys.push(...(data.keys || []))
    } catch {
      store = {}
    }
  }

  function persist() {
    try {
      writeFileSync(filePath, JSON.stringify({ store, keys }), 'utf-8')
    } catch {
      // Silently fail — persistence is best-effort
    }
  }

  return {
    get(key: string): unknown {
      return store[key]
    },
    set(key: string, value: unknown): void {
      if (!(key in store)) {
        keys.push(key)
      }
      store[key] = value
      while (keys.length > MAX_ITEMS) {
        const oldest = keys.shift()!
        delete store[oldest]
      }
      persist()
    },
  }
}