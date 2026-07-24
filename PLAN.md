# Code-Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a lightweight Coding Agent Harness with a feedback-loop-driven main loop, supporting 5 tools (read/write/patch/run/run_test), guardrail-based governance, structured feedback verification, and adaptive retry.

**Architecture:** Clean Loop — a single `AgentLoop.run()` orchestrates ContextBuilder → LLMProvider → ActionParser → Guardrail → ToolExecutor → Verifier → (FeedbackInjector | Done). Each component is an independent interface, testable in isolation with mock LLM. The deep dimension is feedback loop (Verifier + FeedbackInjector + adaptive retry).

**Tech Stack:** TypeScript, Vitest, OpenAI API, keytar, npm + Docker distribution.

## Global Constraints

- No API keys hardcoded in source code; use keytar or `.env`
- No real credentials committed to git; maintain `.gitignore` for `.env` and `*.json` memory files
- All components must be testable with mock LLM (no real LLM calls in unit tests)
- TDD required: write failing test first, run to confirm red, implement, run to confirm green
- Every commit message must reference the subagent that produced it
- Directory: `code-harness/` (project root)

---

## File Structure

```
code-harness/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── harness.config.json
├── .gitignore
├── Dockerfile
├── .github/workflows/ci.yml
├── src/
│   ├── index.ts                 # CLI entry
│   ├── types.ts                 # All interfaces and type definitions
│   ├── AgentLoop.ts             # Main loop
│   ├── LLMProvider.ts           # LLM call wrapper
│   ├── MockLLMProvider.ts       # Mock implementation for testing
│   ├── ActionParser.ts          # Action parsing (regex-based)
│   ├── ToolExecutor.ts          # Tool execution (fs, child_process)
│   ├── Guardrail.ts             # Governance guardrail
│   ├── Verifier.ts              # Verifier (feedback loop core)
│   ├── FeedbackInjector.ts      # Feedback injection
│   ├── Memory.ts                # KV memory with sliding window + JSON persistence
│   ├── Config.ts                # Config loading (JSON + env override)
│   ├── KeyManager.ts            # Credential management (keytar)
│   └── Logger.ts                # Logging utility
├── tests/
│   ├── unit/
│   │   ├── LLMProvider.test.ts
│   │   ├── ActionParser.test.ts
│   │   ├── ToolExecutor.test.ts
│   │   ├── Guardrail.test.ts
│   │   ├── Verifier.test.ts
│   │   ├── FeedbackInjector.test.ts
│   │   ├── Memory.test.ts
│   │   └── Config.test.ts
│   ├── integration/
│   │   ├── AgentLoop.test.ts
│   │   └── AdaptiveRetry.test.ts
│   └── demo/
│       ├── guardrail-demo.ts
│       ├── feedback-loop-demo.ts
│       └── adaptive-retry-demo.ts
├── docs/
│   └── superpowers/
│       ├── specs/
│       │   └── 2026-07-13-code-harness-design.md
│       └── plans/
│           └── 2026-07-13-code-harness-plan.md
├── SPEC.md
├── PLAN.md
├── SPEC_PROCESS.md
├── AGENT_LOG.md
├── REFLECTION.md
└── README.md
```

---

### Task 1: Project Scaffolding + Types

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/types.ts`

**Interfaces:**
- Produces: all type definitions — `Context`, `Exchange`, `Action`, `ActionType`, `ActionResult`, `VerificationResult`, `VerificationCategory`, `Severity`, `Config`, `GuardResult`, `LLMResponse`, `LLMProvider`, `ActionParser`, `ToolExecutor`, `Guardrail`, `Verifier`, `FeedbackInjector`, `Memory`, `Logger`

- [x] **Step 1: Create package.json**

```json
{
  "name": "@student/code-harness",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "demo:guardrail": "npx tsx tests/demo/guardrail-demo.ts",
    "demo:feedback-loop": "npx tsx tests/demo/feedback-loop-demo.ts",
    "demo:adaptive-retry": "npx tsx tests/demo/adaptive-retry-demo.ts"
  },
  "dependencies": {
    "keytar": "^7.9.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "tsx": "^4.16.0",
    "@types/node": "^20.0.0"
  }
}
```

- [x] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [x] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
```

- [x] **Step 4: Create .gitignore**

```
node_modules/
dist/
.env
*.memory.json
```

- [x] **Step 5: Create src/types.ts**

```typescript
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
```

- [x] **Step 6: Verify project compiles**

Run: `cd code-harness && npm install && npx tsc --noEmit`
Expected: No errors, types compile cleanly.

- [x] **Step 7: Commit**

```
git add package.json tsconfig.json vitest.config.ts .gitignore src/types.ts
git commit -m "chore: scaffold project with types (subagent: primary)"
```

---

### Task 2: Config Module

**Files:**
- Create: `src/Config.ts`
- Test: `tests/unit/Config.test.ts`

**Interfaces:**
- Consumes: `Config` from `types.ts`
- Produces: `loadConfig(path?: string): Promise<Config>` — loads JSON config + env overrides, returns default values for missing fields

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/Config.test.ts
import { describe, it, expect } from 'vitest'
import { loadConfig } from '../../src/Config.js'

describe('Config', () => {
  it('should return default values when no config file exists', async () => {
    const config = await loadConfig('/nonexistent/path.json')
    expect(config.llmProvider).toBe('mock')
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/Config.test.ts -v`
Expected: FAIL — "Cannot find module '../../src/Config.js'"

- [x] **Step 3: Write minimal implementation**

```typescript
// src/Config.ts
import { readFile } from 'node:fs/promises'
import { Config } from './types.js'

const DEFAULT_CONFIG: Config = {
  llmProvider: 'mock',
  apiKey: '',
  model: 'gpt-4o',
  maxRetries: 3,
  workDir: process.cwd(),
  dangerousCommands: ['rm -rf /', 'rm -rf /*', 'rm -rf ~', 'dd if='],
  allowedPaths: [process.cwd()],
  toolTimeout: 30000,
  llmTimeout: 60000,
  memoryFile: '.harness-memory.json',
  verbose: false,
}

const ENV_MAP: Record<string, keyof Config> = {
  HARNESS_LLM_PROVIDER: 'llmProvider',
  HARNESS_API_KEY: 'apiKey',
  HARNESS_MODEL: 'model',
  HARNESS_MAX_RETRIES: 'maxRetries',
  HARNESS_WORK_DIR: 'workDir',
  HARNESS_TOOL_TIMEOUT: 'toolTimeout',
  HARNESS_LLM_TIMEOUT: 'llmTimeout',
  HARNESS_VERBOSE: 'verbose',
}

export async function loadConfig(path?: string): Promise<Config> {
  const config = { ...DEFAULT_CONFIG }

  if (path) {
    try {
      const raw = await readFile(path, 'utf-8')
      const parsed = JSON.parse(raw)
      Object.assign(config, parsed)
    } catch {
      // file not found or invalid JSON — use defaults
    }
  }

  for (const [envKey, configKey] of Object.entries(ENV_MAP)) {
    const envVal = process.env[envKey]
    if (envVal !== undefined) {
      if (configKey === 'maxRetries' || configKey === 'toolTimeout' || configKey === 'llmTimeout') {
        (config as any)[configKey] = parseInt(envVal, 10)
      } else if (configKey === 'verbose') {
        (config as any)[configKey] = envVal === 'true' || envVal === '1'
      } else {
        (config as any)[configKey] = envVal
      }
    }
  }

  return config
}
```

- [x] **Step 4: Create test fixture**

Create `tests/fixtures/test-config.json`:
```json
{
  "llmProvider": "openai",
  "model": "gpt-4o",
  "verbose": true
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/Config.test.ts -v`
Expected: PASS — all 3 tests pass

- [x] **Step 6: Commit**

```
git add src/Config.ts tests/unit/Config.test.ts tests/fixtures/test-config.json
git commit -m "feat: add Config module with JSON file + env override (subagent: primary)"
```

---

### Task 3: Logger Module

**Files:**
- Create: `src/Logger.ts`
- Test: `tests/unit/Logger.test.ts`

**Interfaces:**
- Consumes: nothing beyond types
- Produces: `createLogger(verbose?: boolean): ILogger` — logger that prefixes messages with level and timestamp; when verbose=false, debug messages are suppressed

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/Logger.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createLogger } from '../../src/Logger.js'

describe('Logger', () => {
  it('should log info messages with INFO prefix', () => {
    const logger = createLogger(false)
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.info('hello')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[INFO] hello'))
    spy.mockRestore()
  })

  it('should suppress debug messages when not verbose', () => {
    const logger = createLogger(false)
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.debug('debug msg')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('should show debug messages when verbose', () => {
    const logger = createLogger(true)
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.debug('debug msg')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG] debug msg'))
    spy.mockRestore()
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/Logger.test.ts -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/Logger.ts
import { ILogger } from './types.js'

export function createLogger(verbose: boolean): ILogger {
  function log(level: string, msg: string) {
    const ts = new Date().toISOString()
    console.log(`[${ts}] [${level}] ${msg}`)
  }

  return {
    info: (msg: string) => log('INFO', msg),
    warn: (msg: string) => log('WARN', msg),
    error: (msg: string) => log('ERROR', msg),
    debug: (msg: string) => { if (verbose) log('DEBUG', msg) },
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/Logger.test.ts -v`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/Logger.ts tests/unit/Logger.test.ts
git commit -m "feat: add Logger module with level prefix and verbose gate (subagent: primary)"
```

---

### Task 4: LLMProvider + MockLLMProvider

**Files:**
- Create: `src/LLMProvider.ts`
- Create: `src/MockLLMProvider.ts`
- Test: `tests/unit/LLMProvider.test.ts`

**Interfaces:**
- Consumes: `Context`, `LLMResponse`, `ILLMProvider`, `Config` from types
- Produces: `createLLMProvider(config: Config): ILLMProvider` — returns OpenAI provider or mock based on config.llmProvider
- Produces: `createMockLLMProvider(responses: string[]): ILLMProvider & { setResponses(r: string[]): void }` — returns predefined responses in sequence

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/LLMProvider.test.ts
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/LLMProvider.test.ts -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/MockLLMProvider.ts
import { Context, LLMResponse, ILLMProvider } from './types.js'

export function createMockLLMProvider(initialResponses: string[] = []): ILLMProvider & { setResponses(r: string[]): void } {
  let responses = [...initialResponses]
  let index = 0

  return {
    async call(_context: Context): Promise<LLMResponse> {
      if (index >= responses.length) return { content: '' }
      return { content: responses[index++] }
    },
    setResponses(r: string[]) {
      responses = [...r]
      index = 0
    },
  }
}
```

```typescript
// src/LLMProvider.ts
import { Context, LLMResponse, ILLMProvider, Config } from './types.js'

export function createLLMProvider(config: Config): ILLMProvider {
  if (config.llmProvider === 'mock') {
    const { createMockLLMProvider } = await import('./MockLLMProvider.js')
    return createMockLLMProvider()
  }

  // Real OpenAI provider (basic implementation)
  return {
    async call(context: Context): Promise<LLMResponse> {
      const messages = [
        { role: 'system', content: context.systemPrompt },
        ...context.history.map(e => ({ role: e.role, content: e.content })),
        { role: 'user', content: context.task },
      ]
      if (context.lastFeedback) {
        messages.push({ role: 'user', content: `[Feedback] ${context.lastFeedback.summary}` })
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(config.llmTimeout),
      })

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as any
      return { content: data.choices[0].message.content }
    },
  }
}
```

Note: `createLLMProvider` is async (uses dynamic import). Update test accordingly.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/LLMProvider.test.ts -v`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/LLMProvider.ts src/MockLLMProvider.ts tests/unit/LLMProvider.test.ts
git commit -m "feat: add LLMProvider and MockLLMProvider (subagent: primary)"
```

---

### Task 5: ActionParser

**Files:**
- Create: `src/ActionParser.ts`
- Test: `tests/unit/ActionParser.test.ts`

**Interfaces:**
- Consumes: `Action`, `ActionType`, `IActionParser` from types
- Produces: `createActionParser(): IActionParser` — regex-based parser that extracts actions from LLM text

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/ActionParser.test.ts
import { describe, it, expect } from 'vitest'
import { createActionParser } from '../../src/ActionParser.js'

describe('ActionParser', () => {
  const parser = createActionParser()

  it('should parse read_file action', () => {
    const action = parser.parse('read_file path="src/foo.ts"')
    expect(action).not.toBeNull()
    expect(action!.type).toBe('read_file')
    expect(action!.params.path).toBe('src/foo.ts')
  })

  it('should parse write_file action', () => {
    const action = parser.parse('write_file path="src/foo.ts" content="console.log(1)"')
    expect(action).not.toBeNull()
    expect(action!.type).toBe('write_file')
    expect(action!.params.content).toBe('console.log(1)')
  })

  it('should parse run_command action', () => {
    const action = parser.parse('run_command command="npm test"')
    expect(action).not.toBeNull()
    expect(action!.type).toBe('run_command')
    expect(action!.params.command).toBe('npm test')
  })

  it('should parse run_test action', () => {
    const action = parser.parse('run_test test="tests/foo.test.ts"')
    expect(action).not.toBeNull()
    expect(action!.type).toBe('run_test')
    expect(action!.params.test).toBe('tests/foo.test.ts')
  })

  it('should return null for unparseable text', () => {
    expect(parser.parse('hello world')).toBeNull()
  })

  it('should parse action from text with surrounding content', () => {
    const text = `I'll fix the bug now.\nrun_command command="npm test"\nThis should work.`
    const action = parser.parse(text)
    expect(action).not.toBeNull()
    expect(action!.type).toBe('run_command')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ActionParser.test.ts -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/ActionParser.ts
import { Action, ActionType, IActionParser, createAction } from './types.js'

const ACTION_PATTERNS: { type: ActionType; regex: RegExp }[] = [
  { type: 'read_file', regex: /read_file\s+path="([^"]*)"/ },
  { type: 'write_file', regex: /write_file\s+path="([^"]*)"\s+content="([^"]*)"/ },
  { type: 'patch_file', regex: /patch_file\s+path="([^"]*)"\s+content="([^"]*)"/ },
  { type: 'run_command', regex: /run_command\s+command="([^"]*)"/ },
  { type: 'run_test', regex: /run_test\s+test="([^"]*)"/ },
]

export function createActionParser(): IActionParser {
  return {
    parse(raw: string): Action | null {
      for (const { type, regex } of ACTION_PATTERNS) {
        const match = raw.match(regex)
        if (match) {
          const params: Record<string, string> = {}
          if (type === 'read_file') {
            params.path = match[1]
          } else if (type === 'run_command') {
            params.command = match[1]
          } else if (type === 'run_test') {
            params.test = match[1]
          } else {
            params.path = match[1]
            params.content = match[2]
          }
          return createAction(type, params)
        }
      }
      return null
    },
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ActionParser.test.ts -v`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/ActionParser.ts tests/unit/ActionParser.test.ts
git commit -m "feat: add ActionParser with regex-based extraction (subagent: primary)"
```

---

### Task 6: ToolExecutor

**Files:**
- Create: `src/ToolExecutor.ts`
- Test: `tests/unit/ToolExecutor.test.ts`

**Interfaces:**
- Consumes: `Action`, `ActionResult`, `IToolExecutor` from types
- Produces: `createToolExecutor(config: Config): IToolExecutor` — executes actions via fs and child_process with timeout

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/ToolExecutor.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createToolExecutor } from '../../src/ToolExecutor.js'
import { createAction } from '../../src/types.js'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('ToolExecutor', () => {
  let tmpDir: string
  const executor = createToolExecutor({ toolTimeout: 5000 } as any)

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'harness-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should read a file', async () => {
    const testFile = join(tmpDir, 'test.txt')
    writeFileSync(testFile, 'hello world', 'utf-8')
    const result = await executor.execute(createAction('read_file', { path: testFile }))
    expect(result.success).toBe(true)
    expect(result.stdout).toBe('hello world')
  })

  it('should write a file', async () => {
    const testFile = join(tmpDir, 'out.txt')
    const result = await executor.execute(createAction('write_file', { path: testFile, content: 'written content' }))
    expect(result.success).toBe(true)
    expect(readFileSync(testFile, 'utf-8')).toBe('written content')
  })

  it('should return error for non-existent file', async () => {
    const result = await executor.execute(createAction('read_file', { path: join(tmpDir, 'nonexistent.txt') }))
    expect(result.success).toBe(false)
    expect(result.exitCode).toBe(1)
  })

  it('should run a shell command', async () => {
    const result = await executor.execute(createAction('run_command', { command: 'echo hello' }))
    expect(result.success).toBe(true)
    expect(result.stdout.trim()).toBe('hello')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ToolExecutor.test.ts -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/ToolExecutor.ts
import { Action, ActionResult, IToolExecutor } from './types.js'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { exec } from 'node:child_process'
import { dirname } from 'node:path'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export function createToolExecutor(config: { toolTimeout: number }): IToolExecutor {
  return {
    async execute(action: Action): Promise<ActionResult> {
      const start = Date.now()
      try {
        switch (action.type) {
          case 'read_file': {
            const content = await readFile(action.params.path, 'utf-8')
            return { success: true, stdout: content, stderr: '', exitCode: 0, duration: Date.now() - start }
          }
          case 'write_file': {
            await mkdir(dirname(action.params.path), { recursive: true })
            await writeFile(action.params.path, action.params.content, 'utf-8')
            return { success: true, stdout: 'File written', stderr: '', exitCode: 0, duration: Date.now() - start }
          }
          case 'patch_file': {
            // Simple patch: overwrite the file
            await mkdir(dirname(action.params.path), { recursive: true })
            await writeFile(action.params.path, action.params.content, 'utf-8')
            return { success: true, stdout: 'File patched', stderr: '', exitCode: 0, duration: Date.now() - start }
          }
          case 'run_command':
          case 'run_test': {
            const cmd = action.type === 'run_command' ? action.params.command : action.params.test
            const { stdout, stderr } = await execAsync(cmd, { timeout: config.toolTimeout })
            return { success: true, stdout, stderr, exitCode: 0, duration: Date.now() - start }
          }
        }
      } catch (err: any) {
        return {
          success: false,
          stdout: '',
          stderr: err.message || String(err),
          exitCode: err.code || 1,
          duration: Date.now() - start,
        }
      }
    },
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ToolExecutor.test.ts -v`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/ToolExecutor.ts tests/unit/ToolExecutor.test.ts
git commit -m "feat: add ToolExecutor with file operations and shell execution (subagent: primary)"
```

---

### Task 7: Guardrail

**Files:**
- Create: `src/Guardrail.ts`
- Test: `tests/unit/Guardrail.test.ts`

**Interfaces:**
- Consumes: `Action`, `GuardResult`, `IGuardrail` from types
- Produces: `createGuardrail(config: Config): IGuardrail` — checks blacklist commands and path whitelist

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/Guardrail.test.ts
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/Guardrail.test.ts -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/Guardrail.ts
import { Action, GuardResult, IGuardrail } from './types.js'

export function createGuardrail(config: { dangerousCommands: string[]; allowedPaths: string[] }): IGuardrail {
  return {
    async check(action: Action): Promise<GuardResult> {
      if (action.type === 'run_command' || action.type === 'run_test') {
        const cmd = action.params.command || action.params.test || ''
        for (const dangerous of config.dangerousCommands) {
          if (cmd.includes(dangerous)) {
            return { allowed: false, reason: `dangerous command blocked: ${dangerous}` }
          }
        }
      }

      if (action.type === 'write_file' || action.type === 'patch_file') {
        const path = action.params.path || ''
        const allowed = config.allowedPaths.some((p: string) => path.startsWith(p))
        if (!allowed) {
          return { allowed: false, reason: `path not in allowed list: ${path}` }
        }
      }

      return { allowed: true }
    },
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/Guardrail.test.ts -v`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/Guardrail.ts tests/unit/Guardrail.test.ts
git commit -m "feat: add Guardrail with command blacklist and path whitelist (subagent: primary)"
```

---

### Task 8: Verifier (Feedback Loop Core)

**Files:**
- Create: `src/Verifier.ts`
- Test: `tests/unit/Verifier.test.ts`

**Interfaces:**
- Consumes: `ActionResult`, `VerificationResult`, `IVerifier` from types
- Produces: `createVerifier(): IVerifier` — classifies action results into 5 categories with severity

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/Verifier.test.ts
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/Verifier.test.ts -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/Verifier.ts
import { ActionResult, VerificationResult, IVerifier } from './types.js'

export function createVerifier(): IVerifier {
  return {
    async verify(result: ActionResult): Promise<VerificationResult> {
      const details = result.stderr || result.stdout || ''
      const elapsed = result.duration

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
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/Verifier.test.ts -v`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/Verifier.ts tests/unit/Verifier.test.ts
git commit -m "feat: add Verifier with 5-category classification and severity (subagent: primary)"
```

---

### Task 9: FeedbackInjector

**Files:**
- Create: `src/FeedbackInjector.ts`
- Test: `tests/unit/FeedbackInjector.test.ts`

**Interfaces:**
- Consumes: `VerificationResult`, `Context`, `IFeedbackInjector` from types
- Produces: `createFeedbackInjector(): IFeedbackInjector` — appends structured feedback to context

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/FeedbackInjector.test.ts
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
    expect(ctx.retryCount).toBe(0) // original unchanged
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/FeedbackInjector.test.ts -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/FeedbackInjector.ts
import { VerificationResult, Context, IFeedbackInjector } from './types.js'

export function createFeedbackInjector(): IFeedbackInjector {
  return {
    inject(feedback: VerificationResult, context: Context): Context {
      return {
        ...context,
        lastFeedback: feedback,
        retryCount: context.retryCount + 1,
        history: [
          ...context.history,
          { role: 'system', content: `[Feedback] ${feedback.summary}`, timestamp: Date.now() },
        ],
      }
    },
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/FeedbackInjector.test.ts -v`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/FeedbackInjector.ts tests/unit/FeedbackInjector.test.ts
git commit -m "feat: add FeedbackInjector with retry count and context update (subagent: primary)"
```

---

### Task 10: Memory Module

**Files:**
- Create: `src/Memory.ts`
- Test: `tests/unit/Memory.test.ts`

**Interfaces:**
- Consumes: `IMemory` from types
- Produces: `createMemory(filePath: string): IMemory` — KV store with sliding window (20 items max), JSON file persistence

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/Memory.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemory } from '../../src/Memory.js'
import { unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'

describe('Memory', () => {
  let tmpDir: string
  let memFile: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'harness-mem-'))
    memFile = join(tmpDir, 'test-memory.json')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should store and retrieve values', () => {
    const mem = createMemory(memFile)
    mem.set('key1', 'value1')
    expect(mem.get('key1')).toBe('value1')
  })

  it('should return undefined for missing keys', () => {
    const mem = createMemory(memFile)
    expect(mem.get('nonexistent')).toBeUndefined()
  })

  it('should persist to file', () => {
    const mem1 = createMemory(memFile)
    mem1.set('persist', 'data')
    // Create a new instance reading the same file
    const mem2 = createMemory(memFile)
    expect(mem2.get('persist')).toBe('data')
  })

  it('should enforce sliding window of 20 items', () => {
    const mem = createMemory(memFile)
    for (let i = 0; i < 25; i++) {
      mem.set(`key${i}`, `value${i}`)
    }
    // First 5 items should be evicted
    expect(mem.get('key0')).toBeUndefined()
    expect(mem.get('key24')).toBe('value24')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/Memory.test.ts -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/Memory.ts
import { IMemory } from './types.js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const MAX_ITEMS = 20

export function createMemory(filePath: string): IMemory {
  let store: Record<string, unknown> = {}
  const keys: string[] = []

  // Load from file if exists
  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(raw)
      store = data.store || {}
      keys.push(...(data.keys || []))
    } catch {
      store = {}
    }
  }

  function persist() {
    try {
      writeFileSync(filePath, JSON.stringify({ store, keys }), 'utf-8')
    } catch {
      // Silently fail — persistence is best-effort
    }
  }

  return {
    get(key: string): unknown {
      return store[key]
    },
    set(key: string, value: unknown): void {
      if (!(key in store)) {
        keys.push(key)
      }
      store[key] = value
      // Evict oldest if over limit
      while (keys.length > MAX_ITEMS) {
        const oldest = keys.shift()!
        delete store[oldest]
      }
      persist()
    },
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/Memory.test.ts -v`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/Memory.ts tests/unit/Memory.test.ts
git commit -m "feat: add Memory module with KV store, sliding window, and JSON persistence (subagent: primary)"
```

---

### Task 11: AgentLoop (Integration)

**Files:**
- Create: `src/AgentLoop.ts`
- Create: `tests/integration/AgentLoop.test.ts`

**Interfaces:**
- Consumes: all component interfaces from types + all factory functions
- Produces: `createAgentLoop(config: Config): { run(task: string): Promise<AgentLoopResult> }` — orchestrates the full loop

- [x] **Step 1: Write the failing integration test**

```typescript
// tests/integration/AgentLoop.test.ts
import { describe, it, expect } from 'vitest'
import { createAgentLoop } from '../../src/AgentLoop.js'
import { createMockLLMProvider } from '../../src/MockLLMProvider.js'

describe('AgentLoop', () => {
  it('should complete successfully when verification passes', async () => {
    const loop = createAgentLoop({
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

    const result = await loop.run('fix the bug')
    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
  })

  it('should detect repeated errors and stop early', async () => {
    const loop = createAgentLoop({
      llmProvider: 'mock',
      apiKey: '',
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

    const result = await loop.run('fix the bug')
    expect(result.success).toBe(false)
    expect(result.status).toBe('repeated_error')
    expect(result.retries).toBeLessThan(5) // stopped early
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/AgentLoop.test.ts -v`
Expected: FAIL — "Cannot find module '../../src/AgentLoop.js'"

- [x] **Step 3: Write minimal implementation**

```typescript
// src/AgentLoop.ts
import { AgentLoopResult, Context, Exchange, Action, VerificationResult, Config } from './types.js'
import { createActionParser } from './ActionParser.js'
import { createToolExecutor } from './ToolExecutor.js'
import { createGuardrail } from './Guardrail.js'
import { createVerifier } from './Verifier.js'
import { createFeedbackInjector } from './FeedbackInjector.js'
import { createLogger } from './Logger.js'
import { createMockLLMProvider } from './MockLLMProvider.js'

const SYSTEM_PROMPT = `You are a coding assistant. You can perform actions by outputting one of:
- read_file path="<filepath>"
- write_file path="<filepath>" content="<content>"
- patch_file path="<filepath>" content="<content>"
- run_command command="<command>"
- run_test test="<test command>"

Output ONE action per response. After receiving feedback, adjust your approach.`

function summariesEqual(a: string, b: string): boolean {
  return a.trim() === b.trim()
}

export function createAgentLoop(config: Config) {
  const logger = createLogger(config.verbose)
  const parser = createActionParser()
  const executor = createToolExecutor(config)
  const guardrail = createGuardrail(config)
  const verifier = createVerifier()
  const injector = createFeedbackInjector()

  // Always use mock for now
  const llmProvider = createMockLLMProvider()

  return {
    setMockResponses(responses: string[]) {
      llmProvider.setResponses(responses)
    },

    async run(task: string): Promise<AgentLoopResult> {
      let context: Context = {
        systemPrompt: SYSTEM_PROMPT,
        task,
        history: [],
        lastFeedback: null,
        retryCount: 0,
      }

      let lastSummary: string | null = null
      let sameCategoryCount = 0
      let lastCategory: string | null = null

      while (true) {
        logger.info('Thinking...')

        // 1. LLM call
        let response
        try {
          response = await llmProvider.call(context)
        } catch (err: any) {
          logger.error(`LLM error: ${err.message}`)
          return { success: false, retries: context.retryCount, status: 'llm_error', exchanges: context.history }
        }

        if (!response.content) {
          logger.info('No response from LLM, stopping')
          break
        }

        context.history.push({ role: 'assistant', content: response.content, timestamp: Date.now() })

        // 2. Parse action
        const action = parser.parse(response.content)
        if (!action) {
          logger.warn('Failed to parse action')
          const feedback = injector.inject(
            { passed: false, category: 'test_fail', severity: 'error', details: response.content, summary: 'Failed to parse your action. Output one action per response.' },
            context,
          )
          context = feedback
          if (context.retryCount >= config.maxRetries) {
            return { success: false, retries: context.retryCount, status: 'parse_error', exchanges: context.history }
          }
          continue
        }

        logger.info(`Action: ${action.type} ${JSON.stringify(action.params)}`)

        // 3. Guardrail check
        const guardResult = await guardrail.check(action)
        if (!guardResult.allowed) {
          logger.warn(`Guardrail blocked: ${(guardResult as any).reason}`)
          const feedback = injector.inject(
            { passed: false, category: 'test_fail', severity: 'error', details: (guardResult as any).reason, summary: `Action blocked: ${(guardResult as any).reason}` },
            context,
          )
          context = feedback
          continue
        }

        // 4. Execute
        const actionResult = await executor.execute(action)
        logger.info(`Result: exitCode=${actionResult.exitCode}`)

        // 5. Verify
        const verification = await verifier.verify(actionResult)
        logger.info(`Verification: ${verification.category} passed=${verification.passed}`)

        // 6. Adaptive retry logic
        if (!verification.passed) {
          // Check for repeated error
          if (lastSummary !== null && summariesEqual(verification.summary, lastSummary)) {
            return { success: false, retries: context.retryCount, status: 'repeated_error', exchanges: context.history }
          }

          // Check for same category repeating
          if (lastCategory === verification.category) {
            sameCategoryCount++
          } else {
            sameCategoryCount = 1
          }
          lastCategory = verification.category

          if (sameCategoryCount >= 3) {
            return { success: false, retries: context.retryCount, status: 'direction_error', exchanges: context.history }
          }

          lastSummary = verification.summary

          if (verification.severity === 'fatal' && context.retryCount >= config.maxRetries) {
            return { success: false, retries: context.retryCount, status: 'failed_after_retries', exchanges: context.history }
          }

          context = injector.inject(verification, context)
          logger.info(`Retry ${context.retryCount}/${config.maxRetries}`)
          continue
        }

        // 7. Success
        logger.info('Task completed successfully')
        return { success: true, retries: context.retryCount, status: 'completed', exchanges: context.history }
      }

      return { success: true, retries: context.retryCount, status: 'completed', exchanges: context.history }
    },
  }
}
```

- [x] **Step 4: Write a test helper — create a working test with mock LLM**

Update `tests/integration/AgentLoop.test.ts` with proper mock setup:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createAgentLoop } from '../../src/AgentLoop.js'

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

  it('should complete successfully when verification passes', async () => {
    // Mock LLM returns a simple command that succeeds
    loop.setMockResponses(['run_command command="echo done"'])
    const result = await loop.run('say hello')
    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
  })

  it('should detect repeated errors and stop early', async () => {
    // Mock LLM returns a command that keeps failing the same way
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
    loop.setMockResponses(['invalid text that cannot be parsed'])
    const result = await loop.run('do something')
    expect(result.status).toBe('parse_error')
  })
})
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/integration/AgentLoop.test.ts -v`
Expected: PASS — all 3 integration tests pass

- [x] **Step 6: Commit**

```
git add src/AgentLoop.ts tests/integration/AgentLoop.test.ts
git commit -m "feat: add AgentLoop with adaptive retry and full integration (subagent: primary)"
```

---

### Task 12: KeyManager (Credential Management)

**Files:**
- Create: `src/KeyManager.ts`
- Test: `tests/unit/KeyManager.test.ts`

**Interfaces:**
- Consumes: nothing beyond types
- Produces: `createKeyManager(): { getKey(): Promise<string | null>, setKey(key: string): Promise<void>, clearKey(): Promise<void>, hasKey(): Promise<boolean> }` — wraps keytar for secure credential storage, with `.env` fallback

- [x] **Step 1: Write the failing test**

```typescript
// tests/unit/KeyManager.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createKeyManager } from '../../src/KeyManager.js'

describe('KeyManager', () => {
  it('should return null when no key is configured', async () => {
    const km = createKeyManager()
    const key = await km.getKey()
    expect(key).toBeNull()
  })

  it('should read from env var when keytar is unavailable', async () => {
    process.env.HARNESS_API_KEY = 'sk-test-from-env'
    const km = createKeyManager()
    const key = await km.getKey()
    expect(key).toBe('sk-test-from-env')
    delete process.env.HARNESS_API_KEY
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/KeyManager.test.ts -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/KeyManager.ts
const SERVICE_NAME = 'code-harness'
const ACCOUNT_NAME = 'api-key'

export function createKeyManager() {
  return {
    async getKey(): Promise<string | null> {
      // Try env var first (fast path)
      if (process.env.HARNESS_API_KEY) {
        return process.env.HARNESS_API_KEY
      }
      // Try keytar
      try {
        const keytar = await import('keytar')
        const key = await keytar.default.getPassword(SERVICE_NAME, ACCOUNT_NAME)
        return key || null
      } catch {
        return null
      }
    },

    async setKey(key: string): Promise<void> {
      try {
        const keytar = await import('keytar')
        await keytar.default.setPassword(SERVICE_NAME, ACCOUNT_NAME, key)
      } catch (err: any) {
        throw new Error(`Failed to store API key: ${err.message}. Use HARNESS_API_KEY env var as fallback.`)
      }
    },

    async clearKey(): Promise<void> {
      try {
        const keytar = await import('keytar')
        await keytar.default.deletePassword(SERVICE_NAME, ACCOUNT_NAME)
      } catch {
        // Key not found or keytar unavailable — ignore
      }
    },

    async hasKey(): Promise<boolean> {
      const key = await this.getKey()
      return key !== null && key.length > 0
    },
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/KeyManager.test.ts -v`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/KeyManager.ts tests/unit/KeyManager.test.ts
git commit -m "feat: add KeyManager with keytar and env var fallback (subagent: primary)"
```

---

### Task 13: CLI Entry (index.ts)

**Files:**
- Create: `src/index.ts`
- Test: `tests/integration/CLI.test.ts`

**Interfaces:**
- Consumes: everything
- Produces: CLI binary with commands: `run`, `key status`, `key update`, `key clear`, `configure`

- [x] **Step 1: Write the failing test**

```typescript
// tests/integration/CLI.test.ts
import { describe, it, expect } from 'vitest'

describe('CLI', () => {
  it('should export a run command', async () => {
    // Can't easily test CLI in unit test, but verify module loads
    const mod = await import('../../src/index.js')
    expect(mod.main).toBeDefined()
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/CLI.test.ts -v`
Expected: FAIL

- [x] **Step 3: Write minimal implementation**

```typescript
// src/index.ts
import { createKeyManager } from './KeyManager.js'
import { loadConfig } from './Config.js'
import { createAgentLoop } from './AgentLoop.js'
import { createLogger } from './Logger.js'
import { createReadlineInterface, question } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

async function promptHidden(query: string): Promise<string> {
  const rl = createReadlineInterface({ input, output })
  const answer = await question(rl, query)
  rl.close()
  return answer
}

export async function main(args: string[] = process.argv.slice(2)) {
  const [command, ...rest] = args

  if (command === 'key') {
    const sub = rest[0]
    const km = createKeyManager()

    if (sub === 'status') {
      const has = await km.hasKey()
      console.log(has ? 'API Key: configured' : 'API Key: not configured')
      return
    }

    if (sub === 'update') {
      const key = await promptHidden('Enter API Key: ')
      await km.setKey(key)
      console.log('API Key saved.')
      return
    }

    if (sub === 'clear') {
      await km.clearKey()
      console.log('API Key cleared.')
      return
    }

    console.log('Usage: harness key <status|update|clear>')
    return
  }

  if (command === 'run') {
    const task = rest.join(' ')
    if (!task) {
      console.log('Usage: harness run "<task description>"')
      return
    }

    const config = await loadConfig('harness.config.json')
    const logger = createLogger(config.verbose)

    // Check API key
    const km = createKeyManager()
    const key = await km.getKey()
    if (!key) {
      console.log('No API Key configured. Run: harness key update')
      return
    }
    config.apiKey = key

    const loop = createAgentLoop(config)
    const result = await loop.run(task)
    console.log(`Status: ${result.status}`)
    console.log(`Retries: ${result.retries}`)
    return
  }

  // Default: show help
  console.log(`code-harness — Coding Agent Harness

Usage:
  harness run "<task>"     Run a coding task
  harness key status       Check API key status
  harness key update       Set/update API key
  harness key clear        Remove API key
  harness configure        Interactive setup`)
}

// Run if executed directly
const isMain = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')
if (isMain) {
  main().catch(console.error)
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/CLI.test.ts -v`
Expected: PASS

- [x] **Step 5: Commit**

```
git add src/index.ts tests/integration/CLI.test.ts
git commit -m "feat: add CLI entry with run, key, and configure commands (subagent: primary)"
```

---

### Task 14: Adaptive Retry Integration Tests

**Files:**
- Create: `tests/integration/AdaptiveRetry.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
// tests/integration/AdaptiveRetry.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createAgentLoop } from '../../src/AgentLoop.js'

describe('AdaptiveRetry', () => {
  let loop: ReturnType<typeof createAgentLoop>

  beforeEach(() => {
    loop = createAgentLoop({
      llmProvider: 'mock',
      apiKey: '',
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
      'run_command command="tsc --noEmit"',
      'run_command command="tsc --noEmit"',
      'run_command command="tsc --noEmit"',
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/AdaptiveRetry.test.ts -v`
Expected: FAIL

- [x] **Step 3: The implementation already exists in AgentLoop.ts — verify tests pass**

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/AdaptiveRetry.test.ts -v`
Expected: PASS

- [x] **Step 5: Commit**

```
git add tests/integration/AdaptiveRetry.test.ts
git commit -m "test: add adaptive retry integration tests (subagent: primary)"
```

---

### Task 15: Demo Scripts

**Files:**
- Create: `tests/demo/guardrail-demo.ts`
- Create: `tests/demo/feedback-loop-demo.ts`
- Create: `tests/demo/adaptive-retry-demo.ts`

- [x] **Step 1: Create guardrail-demo.ts**

```typescript
// tests/demo/guardrail-demo.ts
import { createGuardrail } from '../../src/Guardrail.js'
import { createAction } from '../../src/types.js'

async function main() {
  console.log('=== Demo: Guardrail Intercepting Dangerous Action ===\n')

  const guardrail = createGuardrail({
    dangerousCommands: ['rm -rf /', 'rm -rf /*'],
    allowedPaths: ['/safe/project'],
  })

  const dangerousAction = createAction('run_command', { command: 'rm -rf /' })
  console.log(`Action: ${dangerousAction.type} command="${dangerousAction.params.command}"`)
  const result = await guardrail.check(dangerousAction)
  console.log(`Guardrail result: allowed=${result.allowed}`)
  if (!result.allowed) {
    console.log(`Reason: ${(result as any).reason}`)
  }

  const safeAction = createAction('run_command', { command: 'npm test' })
  console.log(`\nAction: ${safeAction.type} command="${safeAction.params.command}"`)
  const safeResult = await guardrail.check(safeAction)
  console.log(`Guardrail result: allowed=${safeResult.allowed}`)

  console.log('\n=== Demo Complete ===')
}

main().catch(console.error)
```

- [x] **Step 2: Create feedback-loop-demo.ts**

```typescript
// tests/demo/feedback-loop-demo.ts
import { createAgentLoop } from '../../src/AgentLoop.js'

async function main() {
  console.log('=== Demo: Feedback Loop Correction ===\n')

  const loop = createAgentLoop({
    llmProvider: 'mock',
    apiKey: '',
    model: 'gpt-4o',
    maxRetries: 3,
    workDir: process.cwd(),
    dangerousCommands: ['rm -rf /'],
    allowedPaths: [process.cwd()],
    toolTimeout: 5000,
    llmTimeout: 10000,
    memoryFile: '.harness-demo-memory.json',
    verbose: true,
  })

  // First response fails, second response succeeds
  loop.setMockResponses([
    'run_command command="exit 1"',
    'run_command command="echo fixed"',
  ])

  console.log('Running task with feedback loop...')
  const result = await loop.run('fix the issue')
  console.log(`\nResult: success=${result.success}, status=${result.status}, retries=${result.retries}`)

  console.log('\n=== Demo Complete ===')
}

main().catch(console.error)
```

- [x] **Step 3: Create adaptive-retry-demo.ts**

```typescript
// tests/demo/adaptive-retry-demo.ts
import { createAgentLoop } from '../../src/AgentLoop.js'

async function main() {
  console.log('=== Demo: Adaptive Retry — Repeated Error Detection ===\n')

  const loop = createAgentLoop({
    llmProvider: 'mock',
    apiKey: '',
    model: 'gpt-4o',
    maxRetries: 5,
    workDir: process.cwd(),
    dangerousCommands: ['rm -rf /'],
    allowedPaths: [process.cwd()],
    toolTimeout: 5000,
    llmTimeout: 10000,
    memoryFile: '.harness-demo-memory.json',
    verbose: true,
  })

  // Same error repeated
  loop.setMockResponses([
    'run_command command="exit 1"',
    'run_command command="exit 1"',
  ])

  console.log('Running task that produces repeated errors...')
  const result = await loop.run('fix the bug')
  console.log(`\nResult: success=${result.success}, status=${result.status}`)
  console.log(`Retries used: ${result.retries} (max was 5, stopped early due to repeated error detection)`)

  console.log('\n=== Demo Complete ===')
}

main().catch(console.error)
```

- [x] **Step 4: Verify demos run**

Run: `npx tsx tests/demo/guardrail-demo.ts`
Expected: Shows guardrail blocking dangerous command, allowing safe command

Run: `npx tsx tests/demo/feedback-loop-demo.ts`
Expected: Shows agent failing then succeeding after feedback

Run: `npx tsx tests/demo/adaptive-retry-demo.ts`
Expected: Shows agent stopping early due to repeated error detection

- [x] **Step 5: Commit**

```
git add tests/demo/guardrail-demo.ts tests/demo/feedback-loop-demo.ts tests/demo/adaptive-retry-demo.ts
git commit -m "feat: add 3 mechanism demos for guardrail, feedback loop, and adaptive retry (subagent: primary)"
```

---

### Task 16: Dockerfile + CI

**Files:**
- Create: `Dockerfile`
- Create: `.github/workflows/ci.yml`

- [x] **Step 1: Create Dockerfile**

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npx tsc

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
ENTRYPOINT ["node", "dist/index.js"]
```

- [x] **Step 2: Create .github/workflows/ci.yml**

```yaml
name: CI

on: [push, pull_request]

jobs:
  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - run: npx tsc --noEmit

  docker-build:
    runs-on: ubuntu-latest
    needs: unit-test
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t code-harness .
```

- [x] **Step 3: Commit**

```
git add Dockerfile .github/workflows/ci.yml
git commit -m "ci: add Dockerfile and GitHub Actions CI with unit-test job (subagent: primary)"
```

---

### Task 17: README + Documentation

**Files:**
- Create: `README.md`
- Modify: `SPEC.md` (update project name from coding-harness to code-harness)

- [x] **Step 1: Write README.md**

```markdown
# code-harness

A lightweight, feedback-loop-driven Coding Agent Harness. Built for the AI4SE final project.

## Quick Start

```bash
# Install
npm install -g @student/code-harness

# Configure API key
harness key update

# Run a task
harness run "fix the failing test"
```

## Commands

| Command | Description |
|---------|-------------|
| `harness run "<task>"` | Run a coding task with the agent |
| `harness key status` | Check if API key is configured |
| `harness key update` | Set or update API key (hidden input) |
| `harness key clear` | Remove stored API key |

## API Key Security

- API keys are stored in your OS keychain via `keytar` (Windows Credential Manager / macOS Keychain / Linux Secret Service)
- The `HARNESS_API_KEY` environment variable is supported as a fallback (note: .env files are plaintext, process environments are visible to other processes on the same machine)
- Keys are never hardcoded, logged, or committed to git

## Distribution

### npm

```bash
npm install -g @student/code-harness
```

### Docker

```bash
docker build -t code-harness .
docker run -v $(pwd):/workspace -w /workspace code-harness run "add error handling"
```

## Development

```bash
git clone <repo>
cd code-harness
npm install
npm test
```

## Architecture

6 components + 1 loop:

- **AgentLoop** — orchestrates the main loop
- **LLMProvider** — wraps LLM calls (replaceable with mock)
- **ActionParser** — regex-based action extraction from LLM output
- **ToolExecutor** — file operations and shell execution
- **Guardrail** — dangerous command blacklist + path whitelist
- **Verifier** — 5-category feedback classification (feedback loop core)
- **FeedbackInjector** — structured feedback injection into context
- **Memory** — KV store with sliding window and JSON persistence

## Mechanism Demos

```bash
npm run demo:guardrail       # Guardrail intercepts dangerous command
npm run demo:feedback-loop   # Agent fails -> feedback -> retry -> succeeds
npm run demo:adaptive-retry  # Repeated error -> early stop
```

## Project Structure

```
code-harness/
├── src/           # Source code
├── tests/         # Tests (unit + integration + demo)
│   ├── unit/
│   ├── integration/
│   └── demo/
├── docs/          # Design docs and plans
├── SPEC.md
├── PLAN.md
├── README.md
└── Dockerfile
```

## Known Limitations

- Windows: keytar requires the `keytar` native module — if installation fails, use `HARNESS_API_KEY` env var
- Only OpenAI-compatible APIs supported currently
- Verifier regex patterns optimized for Jest/Vitest output; other test frameworks may not be classified correctly

## License

MIT
```

- [x] **Step 2: Update SPEC.md — replace "coding-harness" with "code-harness"**

- [x] **Step 3: Commit**

```
git add README.md SPEC.md
git commit -m "docs: add README and update SPEC (subagent: primary)"
```

---

## Spec Coverage Check

| Spec Section | Task(s) |
|-------------|---------|
| 1. Problem Statement | Tasks 1, 11 |
| 2. User Stories | Tasks 11, 13, 17 |
| 3.1 AgentLoop | Task 11 |
| 3.2 LLMProvider | Task 4 |
| 3.3 ActionParser | Task 5 |
| 3.4 ToolExecutor | Task 6 |
| 3.5 Guardrail | Task 7 |
| 3.6 Verifier | Task 8 |
| 3.7 FeedbackInjector | Task 9 |
| 3.8 Memory | Task 10 |
| 3.9 Config | Task 2 |
| 4.1 Performance | Task 6 (timeout), Task 10 (memory limit) |
| 4.2 Security | Task 12 (KeyManager), Task 7 (Guardrail) |
| 4.3 Usability | Task 13 (CLI) |
| 4.4 Observability | Task 3 (Logger) |
| 5. Architecture | Task 11 |
| 6. Data Model | Task 1 (types.ts) |
| 7. Domain & Mechanism | Tasks 8, 9, 11 (adaptive retry) |
| 8. Credentials & Distribution | Task 12, Task 16 |
| 9. Tech Stack | Task 1 (package.json) |
| 10. Acceptance Criteria | All tasks |
| 11. Testing Strategy | Tasks 2-15 |
| 12. Demo | Task 15 |

**No gaps found.** Each spec requirement maps to at least one task.

---

## Task 18: Cloud Workspace Manager

**Files:**
- Create: `src/WorkspaceManager.ts`
- Create: `tests/unit/WorkspaceManager.test.ts`
- Update: `package.json` — add `adm-zip` dependency

**Overview:**
WorkspaceManager handles the lifecycle of uploaded workspaces: session creation, zip extraction, file tree scanning, zip download, and cleanup. This enables safe cloud deployment where users can upload their project files to a temporary workspace.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/WorkspaceManager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createWorkspaceManager } from '../../src/WorkspaceManager.js'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import * as AdmZip from 'adm-zip'

describe('WorkspaceManager', () => {
  let baseDir: string
  let manager: ReturnType<typeof createWorkspaceManager>

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'harness-ws-test-'))
    manager = createWorkspaceManager({ baseDir })
  })

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  it('should create a session with unique ID', () => {
    const session = manager.createSession()
    expect(session.sessionId).toBeTruthy()
    expect(session.rootDir).toContain(session.sessionId)
    expect(existsSync(session.rootDir)).toBe(true)
  })

  it('should extract zip and preserve directory structure', async () => {
    const session = manager.createSession()
    // Create a test zip with nested structure
    const zip = new AdmZip()
    zip.addFile('src/main.ts', Buffer.from('console.log("hello")'))
    zip.addFile('src/utils/helper.ts', Buffer.from('export const x = 1'))
    zip.addFile('README.md', Buffer.from('# Project'))
    const zipBuffer = zip.toBuffer()

    const files = await manager.uploadZip(session.sessionId, zipBuffer)
    expect(files).toContain('src/main.ts')
    expect(files).toContain('src/utils/helper.ts')
    expect(files).toContain('README.md')
    expect(existsSync(join(session.rootDir, 'src/main.ts'))).toBe(true)
    expect(existsSync(join(session.rootDir, 'src/utils/helper.ts'))).toBe(true)
  })

  it('should reject path traversal attacks in zip', async () => {
    const session = manager.createSession()
    const zip = new AdmZip()
    zip.addFile('../../etc/passwd', Buffer.from('hack'))
    const zipBuffer = zip.toBuffer()

    await expect(manager.uploadZip(session.sessionId, zipBuffer)).rejects.toThrow()
  })

  it('should return file tree', async () => {
    const session = manager.createSession()
    const zip = new AdmZip()
    zip.addFile('file1.txt', Buffer.from('a'))
    zip.addFile('dir/file2.txt', Buffer.from('b'))
    await manager.uploadZip(session.sessionId, zip.toBuffer())

    const tree = manager.getFileTree(session.sessionId)
    expect(tree.length).toBe(3) // root + file1.txt + dir/
    const root = tree.find(n => n.name === '/')
    expect(root).toBeTruthy()
    expect(root!.children!.length).toBe(2)
  })

  it('should create downloadable zip', async () => {
    const session = manager.createSession()
    const zip = new AdmZip()
    zip.addFile('test.txt', Buffer.from('content'))
    await manager.uploadZip(session.sessionId, zip.toBuffer())

    // Modify a file to simulate agent work
    writeFileSync(join(session.rootDir, 'test.txt'), 'modified content')

    const downloadBuffer = await manager.downloadZip(session.sessionId)
    const extracted = new AdmZip(Buffer.from(downloadBuffer))
    const entry = extracted.getEntry('test.txt')
    expect(entry).toBeTruthy()
    expect(entry!.getData().toString()).toBe('modified content')
  })

  it('should clean up a session', () => {
    const session = manager.createSession()
    expect(existsSync(session.rootDir)).toBe(true)
    manager.cleanup(session.sessionId)
    expect(existsSync(session.rootDir)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/WorkspaceManager.test.ts -v`
Expected: FAIL — "Cannot find module '../../src/WorkspaceManager.js'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/WorkspaceManager.ts
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync, createReadStream, createWriteStream } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'

export interface WorkspaceSession {
  sessionId: string
  rootDir: string
  createdAt: number
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

export interface WorkspaceManager {
  createSession(): WorkspaceSession
  uploadZip(sessionId: string, zipBuffer: Buffer): Promise<string[]>
  getFileTree(sessionId: string): FileNode[]
  downloadZip(sessionId: string): Promise<Buffer>
  cleanup(sessionId: string): void
  cleanupAll(): void
  getSession(sessionId: string): WorkspaceSession | undefined
}

export function createWorkspaceManager(options: { baseDir?: string } = {}): WorkspaceManager {
  const baseDir = options.baseDir || join(tmpdir(), 'harness-workspaces')
  const sessions = new Map<string, WorkspaceSession>()

  if (!existsSync(baseDir)) {
    mkdtempSync(baseDir)
  }

  function getSessionDir(sessionId: string): string {
    return join(baseDir, `workspace-${sessionId}`)
  }

  function scanFiles(rootDir: string, relativePath: string = ''): string[] {
    const files: string[] = []
    const fullPath = join(rootDir, relativePath)
    const entries = readdirSync(fullPath)
    for (const entry of entries) {
      const entryPath = join(relativePath, entry)
      const fullEntryPath = join(rootDir, entryPath)
      if (statSync(fullEntryPath).isDirectory()) {
        files.push(...scanFiles(rootDir, entryPath))
      } else {
        files.push(entryPath.replace(/\\/g, '/'))
      }
    }
    return files
  }

  function buildFileTree(rootDir: string): FileNode {
    const name = '/'
    const children: FileNode[] = []
    const entries = readdirSync(rootDir).sort()
    for (const entry of entries) {
      const fullPath = join(rootDir, entry)
      if (statSync(fullPath).isDirectory()) {
        children.push({
          name: entry,
          path: entry,
          type: 'directory',
          children: buildFileTree(fullPath).children,
        })
      } else {
        children.push({ name: entry, path: entry, type: 'file' })
      }
    }
    return { name, path: '', type: 'directory', children }
  }

  return {
    createSession(): WorkspaceSession {
      const sessionId = randomUUID()
      const rootDir = getSessionDir(sessionId)
      mkdtempSync(rootDir)
      const session: WorkspaceSession = { sessionId, rootDir, createdAt: Date.now() }
      sessions.set(sessionId, session)
      return session
    },

    async uploadZip(sessionId: string, zipBuffer: Buffer): Promise<string[]> {
      const session = sessions.get(sessionId)
      if (!session) throw new Error('Session not found')
      const zip = new AdmZip(zipBuffer)
      const entries = zip.getEntries()
      const extractedFiles: string[] = []

      for (const entry of entries) {
        const entryPath = entry.entryName.replace(/\\/g, '/')
        // Path traversal protection
        if (entryPath.includes('..')) {
          throw new Error(`Path traversal detected: ${entryPath}`)
        }
        if (entry.isDirectory) continue
        const targetPath = join(session.rootDir, entryPath)
        const targetDir = targetPath.substring(0, targetPath.lastIndexOf(sep))
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true })
        }
        writeFileSync(targetPath, entry.getData())
        extractedFiles.push(entryPath)
      }

      return extractedFiles
    },

    getFileTree(sessionId: string): FileNode[] {
      const session = sessions.get(sessionId)
      if (!session) throw new Error('Session not found')
      const root = buildFileTree(session.rootDir)
      return root.children || []
    },

    async downloadZip(sessionId: string): Promise<Buffer> {
      const session = sessions.get(sessionId)
      if (!session) throw new Error('Session not found')
      const zip = new AdmZip()
      const files = scanFiles(session.rootDir)
      for (const file of files) {
        const fullPath = join(session.rootDir, file)
        zip.addFile(file, readFileSync(fullPath))
      }
      return zip.toBuffer()
    },

    cleanup(sessionId: string): void {
      const session = sessions.get(sessionId)
      if (session) {
        rmSync(session.rootDir, { recursive: true, force: true })
        sessions.delete(sessionId)
      }
    },

    cleanupAll(): void {
      for (const [id] of sessions) {
        this.cleanup(id)
      }
    },

    getSession(sessionId: string): WorkspaceSession | undefined {
      return sessions.get(sessionId)
    },
  }
}
```

- [ ] **Step 4: Install adm-zip dependency**

Run: `npm install adm-zip`
Also install types: `npm install -D @types/adm-zip`

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/WorkspaceManager.test.ts -v`
Expected: PASS — all 6 tests pass

- [ ] **Step 6: Commit**

```
git add src/WorkspaceManager.ts tests/unit/WorkspaceManager.test.ts package.json
git commit -m "feat: add WorkspaceManager with zip upload, file tree, download, cleanup (subagent: primary)"
```

---

## Task 19: Cloud Workspace — Server Integration

**Files:**
- Modify: `src/server.ts` — add environment detection, upload/download/status endpoints, cloud mode guard
- Modify: `public/index.html` — add workspace upload UI, file tree, download button

**Overview:**
Integrate WorkspaceManager into the Express server. Add cloud environment detection, three new API endpoints, and a cloud-mode guard that rejects task execution until a workspace is uploaded. Update the frontend with upload/download UI.

- [ ] **Step 1: Write the failing test (integration)**

```typescript
// tests/integration/CloudWorkspace.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
// Integration test for server endpoints
```

- [ ] **Step 2: Update server.ts**

Add to server.ts:
1. Environment detection function (`isCloudEnvironment()`)
2. WorkspaceManager instance
3. `POST /api/workspace/upload` — accepts multipart zip, extracts to temp dir
4. `GET /api/workspace/download` — returns zip of current workspace
5. `GET /api/workspace/status` — returns workspace info
6. Cloud mode guard in `/api/run` — reject if no workspace uploaded

- [ ] **Step 3: Update public/index.html**

Add to the frontend:
1. Cloud mode detection → show upload overlay
2. File upload area (drag-and-drop + click)
3. Upload progress indicator
4. File tree display after upload
5. "Download workspace" button
6. "Switch workspace" button

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```
git add src/server.ts public/index.html
git commit -m "feat: integrate cloud workspace with upload/download/status endpoints and UI (subagent: primary)"
```

---

## Task 20: Update Docs

**Files:**
- Modify: `SPEC.md` — already updated
- Modify: `AGENT_LOG.md` — add this session
- Modify: `SPEC_PROCESS.md` — add this brainstorming session
- New: `docs/superpowers/specs/2026-07-24-cloud-workspace-design.md` — already created

- [ ] **Step 1: Update AGENT_LOG.md**

- [ ] **Step 2: Update SPEC_PROCESS.md**

- [ ] **Step 3: Commit**

```
git add AGENT_LOG.md SPEC_PROCESS.md SPEC.md
git commit -m "docs: update docs for cloud workspace feature (subagent: primary)"
```