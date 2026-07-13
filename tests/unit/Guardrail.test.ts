import { describe, it, expect } from 'vitest'
import { createGuardrail } from '../../src/Guardrail.js'
import { createAction } from '../../src/types.js'

describe('Guardrail', () => {
  const guardrail = createGuardrail({
    dangerousCommands: ['rm -rf /', 'rm -rf /*'],
    allowedPaths: ['/home/project'],
  } as any)

  it('should block dangerous commands', async () => {
    const result = await guardrail.check(createAction('run_command', { command: 'rm -rf /' }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toContain('dangerous')
  })

  it('should allow safe commands', async () => {
    const result = await guardrail.check(createAction('run_command', { command: 'npm test' }))
    expect(result.allowed).toBe(true)
  })

  it('should allow reads within allowed paths', async () => {
    const result = await guardrail.check(createAction('read_file', { path: '/home/project/src/main.ts' }))
    expect(result.allowed).toBe(true)
  })

  it('should block writes outside allowed paths', async () => {
    const result = await guardrail.check(createAction('write_file', { path: '/etc/passwd', content: 'hack' }))
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toContain('path')
  })
})