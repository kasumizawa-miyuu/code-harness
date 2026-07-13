import { describe, it, expect } from 'vitest'
import { createFeedbackInjector } from '../../src/FeedbackInjector.js'

describe('FeedbackInjector', () => {
  const injector = createFeedbackInjector()

  it('should inject feedback into context', () => {
    const ctx = { systemPrompt: '', task: 'fix bug', history: [], lastFeedback: null, retryCount: 0 }
    const feedback = { passed: false, category: 'test_fail' as const, severity: 'error' as const, details: 'test failed', summary: 'Test failed: expected 2 got 1' }
    const updated = injector.inject(feedback, ctx)
    expect(updated.lastFeedback).toEqual(feedback)
    expect(updated.retryCount).toBe(1)
  })

  it('should increment retry count', () => {
    const ctx = { systemPrompt: '', task: 'fix bug', history: [], lastFeedback: null, retryCount: 2 }
    const feedback = { passed: false, category: 'test_fail' as const, severity: 'error' as const, details: '', summary: 'fail' }
    const updated = injector.inject(feedback, ctx)
    expect(updated.retryCount).toBe(3)
  })

  it('should not modify the original context', () => {
    const ctx = { systemPrompt: '', task: 'fix bug', history: [], lastFeedback: null, retryCount: 0 }
    const feedback = { passed: false, category: 'test_fail' as const, severity: 'error' as const, details: '', summary: 'fail' }
    injector.inject(feedback, ctx)
    expect(ctx.retryCount).toBe(0)
  })
})