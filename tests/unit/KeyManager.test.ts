import { describe, it, expect, vi } from 'vitest'
import { createKeyManager } from '../../src/KeyManager.js'

describe('KeyManager', () => {
  it('should return null when no key is configured', async () => {
    const km = createKeyManager()
    const key = await km.getKey()
    expect(key).toBeNull()
  })

  it('should read from env var when keytar is unavailable', async () => {
    process.env.HARNESS_API_KEY = 'sk-test-from-env'
    const km = createKeyManager()
    const key = await km.getKey()
    expect(key).toBe('sk-test-from-env')
    delete process.env.HARNESS_API_KEY
  })
})