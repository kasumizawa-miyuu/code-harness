import { describe, it, expect, beforeEach } from 'vitest'
import { createAgentLoop } from '../../src/AgentLoop.js'

describe('AdaptiveRetry', () => {
  let loop: ReturnType<typeof createAgentLoop>

  beforeEach(() => {
    loop = createAgentLoop({
      llmProvider: 'mock',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      maxRetries: 5,
      workDir: process.cwd(),
      dangerousCommands: ['rm -rf /'],
      allowedPaths: [process.cwd()],
      toolTimeout: 5000,
      llmTimeout: 10000,
      memoryFile: '.harness-test-memory.json',
      verbose: false,
    })
  })

  it('should stop on repeated error before max retries', async () => {
    loop.setMockResponses([
      'run_command command="exit 1"',
      'run_command command="exit 1"',
    ])
    const result = await loop.run('task')
    expect(result.status).toBe('repeated_error')
    expect(result.retries).toBeLessThan(5)
  })

  it('should stop on direction error (same category 3 times)', async () => {
    loop.setMockResponses([
      'run_command command="exit 1"',
      'run_command command="exit 2"',
      'run_command command="exit 3"',
    ])
    const result = await loop.run('task')
    expect(result.status).toBe('direction_error')
    expect(result.retries).toBeLessThan(5)
  })

  it('should succeed when feedback fixes the issue', async () => {
    loop.setMockResponses([
      'run_command command="exit 1"',
      'run_command command="echo fixed"',
    ])
    const result = await loop.run('task')
    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
  })
})