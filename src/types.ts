export type VerificationCategory = 'success' | 'test_fail' | 'compile_error' | 'lint_warn' | 'timeout'
export type Severity = 'fatal' | 'error' | 'warning'

export interface VerificationResult {
  passed: boolean
  category: VerificationCategory
  severity: Severity
  details: string
  summary: string
}

export interface Exchange {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface Context {
  systemPrompt: string
  task: string
  history: Exchange[]
  lastFeedback: VerificationResult | null
  retryCount: number
}

export interface IFeedbackInjector {
  inject(feedback: VerificationResult, context: Context): Context
}