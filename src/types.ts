// ===== Action Types =====
export type ActionType = 'read_file' | 'write_file' | 'patch_file' | 'run_command' | 'run_test'

export interface Action {
  type: ActionType
  params: Record<string, string>
  id: string
}

export function createAction(type: ActionType, params: Record<string, string>): Action {
  return { type, params, id: crypto.randomUUID() }
}

// ===== Action Results =====
export interface ActionResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}

// ===== Verification =====
export type VerificationCategory = 'success' | 'test_fail' | 'compile_error' | 'lint_warn' | 'timeout'
export type Severity = 'fatal' | 'error' | 'warning'

export interface VerificationResult {
  passed: boolean
  category: VerificationCategory
  severity: Severity
  details: string
  summary: string
}

// ===== Context =====
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

// ===== Guardrail =====
export type GuardResult = { allowed: true } | { allowed: false; reason: string }

// ===== LLM =====
export interface LLMResponse {
  content: string
}

// ===== Config =====
export interface Config {
  llmProvider: 'openai' | 'anthropic' | 'mock'
  apiKey: string
  baseUrl: string
  model: string
  maxRetries: number
  workDir: string
  dangerousCommands: string[]
  allowedPaths: string[]
  toolTimeout: number
  llmTimeout: number
  memoryFile: string
  verbose: boolean
}

// ===== Component Interfaces =====
export interface ILLMProvider {
  call(context: Context): Promise<LLMResponse>
}

export interface IActionParser {
  parse(raw: string): Action | null
}

export interface IToolExecutor {
  execute(action: Action): Promise<ActionResult>
}

export interface IGuardrail {
  check(action: Action): Promise<GuardResult>
}

export interface IVerifier {
  verify(result: ActionResult): Promise<VerificationResult>
}

export interface IFeedbackInjector {
  inject(feedback: VerificationResult, context: Context): Context
}

export interface IMemory {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export interface ILogger {
  info(msg: string): void
  warn(msg: string): void
  error(msg: string): void
  debug(msg: string): void
}

// ===== AgentLoop Result =====
export interface AgentLoopResult {
  success: boolean
  retries: number
  status: 'completed' | 'failed_after_retries' | 'repeated_error' | 'direction_error' | 'llm_error' | 'parse_error'
  exchanges: Exchange[]
}