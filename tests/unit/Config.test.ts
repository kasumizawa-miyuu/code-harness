import { describe, it, expect } from 'vitest'
import { loadConfig } from '../../src/Config.js'

describe('Config', () => {
  it('should return default values when no config file exists', async () => {
    const config = await loadConfig('/nonexistent/path.json')
    expect(config.llmProvider).toBe('mock')
    expect(config.baseUrl).toBe('https://api.openai.com/v1')
    expect(config.maxRetries).toBe(3)
    expect(config.workDir).toBe(process.cwd())
    expect(config.toolTimeout).toBe(30000)
    expect(config.llmTimeout).toBe(60000)
    expect(config.memoryFile).toBe('.harness-memory.json')
    expect(config.verbose).toBe(false)
  })

  it('should read config values from JSON file', async () => {
    const config = await loadConfig('tests/fixtures/test-config.json')
    expect(config.llmProvider).toBe('openai')
    expect(config.model).toBe('gpt-4o')
    expect(config.verbose).toBe(true)
  })

  it('should allow env vars to override config file values', async () => {
    process.env.HARNESS_MAX_RETRIES = '5'
    const config = await loadConfig('/nonexistent/path.json')
    expect(config.maxRetries).toBe(5)
    delete process.env.HARNESS_MAX_RETRIES
  })
})