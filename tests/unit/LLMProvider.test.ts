import { describe, it, expect } from 'vitest'
import { createMockLLMProvider } from '../../src/MockLLMProvider.js'
import { createAction } from '../../src/types.js'

describe('MockLLMProvider', () => {
  it('should return responses in sequence', async () => {
    const mock = createMockLLMProvider(['response A', 'response B'])
    const ctx = { systemPrompt: '', task: '', history: [], lastFeedback: null, retryCount: 0 }
    expect((await mock.call(ctx)).content).toBe('response A')
    expect((await mock.call(ctx)).content).toBe('response B')
  })

  it('should return empty string when exhausted', async () => {
    const mock = createMockLLMProvider(['only one'])
    const ctx = { systemPrompt: '', task: '', history: [], lastFeedback: null, retryCount: 0 }
    await mock.call(ctx)
    expect((await mock.call(ctx)).content).toBe('')
  })

  it('should allow setting new responses after creation', async () => {
    const mock = createMockLLMProvider([])
    mock.setResponses(['new response'])
    const ctx = { systemPrompt: '', task: '', history: [], lastFeedback: null, retryCount: 0 }
    expect((await mock.call(ctx)).content).toBe('new response')
  })
})