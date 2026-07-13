import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createAgentLoop } from '../../src/AgentLoop.js'
import { existsSync, unlinkSync } from 'node:fs'

describe('AgentLoop', () => {
  let loop: ReturnType<typeof createAgentLoop>

  beforeEach(() => {
    loop = createAgentLoop({
      llmProvider: 'mock',
      apiKey: '',
      model: 'gpt-4o',
      maxRetries: 3,
      workDir: process.cwd(),
      dangerousCommands: ['rm -rf /'],
      allowedPaths: [process.cwd()],
      toolTimeout: 5000,
      llmTimeout: 10000,
      memoryFile: '.harness-test-memory.json',
      verbose: false,
    })
  })

  afterEach(() => {
    try {
      if (existsSync('.harness-test-memory.json')) {
        unlinkSync('.harness-test-memory.json')
      }
    } catch { /* noop */ }
  })

  it('should complete successfully when verification passes', async () => {
    loop.setMockResponses(['run_command command="echo done"'])
    const result = await loop.run('say hello')
    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
  })

  it('should detect repeated errors and stop early', async () => {
    loop.setMockResponses([
      'run_command command="exit 1"',
      'run_command command="exit 1"',
    ])
    const result = await loop.run('do something')
    expect(result.success).toBe(false)
    expect(result.status).toBe('repeated_error')
    expect(result.retries).toBeLessThan(3)
  })

  it('should handle action parsing failure', async () => {
    loop.setMockResponses([
      'invalid text that cannot be parsed',
      'invalid text that cannot be parsed',
      'invalid text that cannot be parsed',
    ])
    const result = await loop.run('do something')
    expect(result.status).toBe('parse_error')
  })
})