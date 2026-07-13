const SERVICE_NAME = 'code-harness'
const ACCOUNT_NAME = 'api-key'

export function createKeyManager() {
  return {
    async getKey(): Promise<string | null> {
      if (process.env.HARNESS_API_KEY) {
        return process.env.HARNESS_API_KEY
      }
      try {
        const keytar = await import('keytar')
        const key = await keytar.default.getPassword(SERVICE_NAME, ACCOUNT_NAME)
        return key || null
      } catch {
        return null
      }
    },

    async setKey(key: string): Promise<void> {
      try {
        const keytar = await import('keytar')
        await keytar.default.setPassword(SERVICE_NAME, ACCOUNT_NAME, key)
      } catch (err: any) {
        throw new Error(`Failed to store API key: ${err.message}. Use HARNESS_API_KEY env var as fallback.`)
      }
    },

    async clearKey(): Promise<void> {
      try {
        const keytar = await import('keytar')
        await keytar.default.deletePassword(SERVICE_NAME, ACCOUNT_NAME)
      } catch {
        // Key not found or keytar unavailable — ignore
      }
    },

    async hasKey(): Promise<boolean> {
      const key = await this.getKey()
      return key !== null && key.length > 0
    },
  }
}