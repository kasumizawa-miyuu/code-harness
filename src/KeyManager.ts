import { readFile, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const KEY_FILE = join(homedir(), '.harness-api-key')

export function createKeyManager() {
  return {
    async hasKey(): Promise<boolean> {
      if (process.env.HARNESS_API_KEY) return true
      return existsSync(KEY_FILE)
    },

    async getKey(): Promise<string | null> {
      if (process.env.HARNESS_API_KEY) return process.env.HARNESS_API_KEY
      try {
        return await readFile(KEY_FILE, 'utf-8')
      } catch {
        return null
      }
    },

    async setKey(key: string): Promise<void> {
      await writeFile(KEY_FILE, key, 'utf-8')
    },

    async clearKey(): Promise<void> {
      try {
        await unlink(KEY_FILE)
      } catch { /* noop */ }
    },
  }
}