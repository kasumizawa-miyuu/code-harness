import { ActionResult, VerificationResult, IVerifier } from './types.js'

export function createVerifier(): IVerifier {
  return {
    async verify(result: ActionResult): Promise<VerificationResult> {
      const details = result.stderr || result.stdout || ''

      // Timeout detection
      if (result.exitCode === 124 || details.includes('TIMEOUT')) {
        return {
          passed: false, category: 'timeout', severity: 'error',
          details, summary: 'Command timed out.',
        }
      }

      // Compile error detection
      if (details.includes('error TS') || details.includes('error:') && (details.includes('.ts:') || details.includes('.js:'))) {
        return {
          passed: false, category: 'compile_error', severity: 'fatal',
          details, summary: `Compile error: ${details.slice(0, 200)}`,
        }
      }

      // Test failure detection
      if (result.exitCode !== 0 && (details.includes('FAIL') || details.includes('failed') || details.includes('AssertionError'))) {
        return {
          passed: false, category: 'test_fail', severity: 'error',
          details, summary: `Test failed: ${details.slice(0, 200)}`,
        }
      }

      // Lint warning detection
      if (details.includes('WARNING') || details.includes('warning:')) {
        return {
          passed: false, category: 'lint_warn', severity: 'warning',
          details, summary: `Lint warning: ${details.slice(0, 200)}`,
        }
      }

      // Success
      return {
        passed: true, category: 'success', severity: 'error',
        details, summary: 'All checks passed.',
      }
    },
  }
}