import { describe, it, expect } from 'vitest'
import { createVerifier } from '../../src/Verifier.js'

describe('Verifier', () => {
  const verifier = createVerifier()

  it('should classify success as passed', async () => {
    const result = await verifier.verify({ success: true, stdout: 'PASS', stderr: '', exitCode: 0, duration: 100 })
    expect(result.passed).toBe(true)
    expect(result.category).toBe('success')
  })

  it('should classify test failures', async () => {
    const result = await verifier.verify({
      success: true, stdout: 'FAIL tests/foo.test.ts', stderr: '1 failed', exitCode: 1, duration: 100,
    })
    expect(result.passed).toBe(false)
    expect(result.category).toBe('test_fail')
    expect(result.severity).toBe('error')
  })

  it('should classify compile errors as fatal', async () => {
    const result = await verifier.verify({
      success: false, stdout: '', stderr: 'src/foo.ts:5: error TS2345', exitCode: 2, duration: 100,
    })
    expect(result.passed).toBe(false)
    expect(result.category).toBe('compile_error')
    expect(result.severity).toBe('fatal')
  })

  it('should classify lint warnings as warning', async () => {
    const result = await verifier.verify({
      success: true, stdout: '', stderr: 'WARNING: unused variable x', exitCode: 0, duration: 100,
    })
    expect(result.passed).toBe(false)
    expect(result.category).toBe('lint_warn')
    expect(result.severity).toBe('warning')
  })

  it('should classify timeout', async () => {
    const result = await verifier.verify({
      success: false, stdout: '', stderr: 'TIMEOUT', exitCode: 124, duration: 30001,
    })
    expect(result.passed).toBe(false)
    expect(result.category).toBe('timeout')
    expect(result.severity).toBe('error')
  })
})