import { describe, it, expect } from 'vitest'

describe('CLI', () => {
  it('should export a run command', async () => {
    const mod = await import('../../src/index.js')
    expect(mod.main).toBeDefined()
  })
})