# code-harness

> **English** · [中文](README.zh.md)

A lightweight, feedback-loop-driven Coding Agent Harness. Built for the AI4SE final project.

**Core equation:** Agent = LLM + Harness. This project implements the harness — the engineering layer that turns an LLM's next-step decisions into a reliable, testable automation system.

## Quick Start

### Option 1: CLI (direct access to local files)

```bash
git clone https://github.com/kasumizawa-miyuu/code-harness.git
cd code-harness
npm install
npm run build
npm link

# Configure
harness configure
harness key update

# Run a task
cd your/work/place
harness run "fix the failing test"
```

### Option 2: Docker (WebUI with local file access)

```bash
docker build -t code-harness .
docker run -v $(pwd):/workspace -w /workspace -p 3000:3000 code-harness
```

Open http://localhost:3000. 

The `-v $(pwd):/workspace` mount gives the WebUI access to your current directory's files.

### Option 3: Deployed WebUI

Visit https://code-harness.onrender.com — no installation needed. Upload your project as a zip file, and the agent works in an isolated cloud workspace.

## Commands

| Command | Description |
|---------|-------------|
| `harness configure` | Interactive setup (LLM provider, base URL, model) |
| `harness run "<task>"` | Run a coding task with the agent |
| `harness serve` | Start WebUI server (http://localhost:3000) |
| `harness key status` | Check if API key is configured |
| `harness key update` | Set or update API key (hidden input) |
| `harness key clear` | Remove stored API key |

## API Key Security

- API keys stored in OS keychain via `keytar` (Windows Credential Manager / macOS Keychain / Linux Secret Service)
- `HARNESS_API_KEY` environment variable supported as fallback (.env files are plaintext; process environments visible to other processes)
- Keys are never hardcoded, logged, or committed to git
- Key status display never reveals the full key

## Distribution

### npm

```bash
npm install -g @student/code-harness
```

### Docker

```bash
docker build -t code-harness .
docker run -v $(pwd):/workspace -w /workspace -p 3000:3000 code-harness
```

## Project Structure

```
code-harness/
├── src/           # Source code (harness kernel)
│   ├── AgentLoop.ts          # Main loop orchestrator
│   ├── LLMProvider.ts        # LLM call wrapper (replaceable with mock)
│   ├── MockLLMProvider.ts    # Mock implementation for deterministic testing
│   ├── ActionParser.ts       # Regex-based action extraction
│   ├── ToolExecutor.ts       # File operations + shell execution + path sandbox
│   ├── Guardrail.ts          # Dangerous command blocking + path whitelist
│   ├── Verifier.ts           # 5-category feedback classification
│   ├── FeedbackInjector.ts   # Structured feedback injection
│   ├── Memory.ts             # KV store with sliding window
│   ├── WorkspaceManager.ts   # Cloud workspace lifecycle (zip upload/download)
│   ├── Config.ts             # Config loading (JSON + env overrides)
│   ├── KeyManager.ts         # Credential management (keytar)
│   ├── Logger.ts             # Logging utility
│   ├── server.ts             # Express server (WebUI backend)
│   └── types.ts              # All interfaces and type definitions
├── tests/         # Tests (unit + integration + demo)
│   ├── unit/       # 11 test files, 44+ tests
│   ├── integration/# 4 test files
│   └── demo/       # 3 mechanism demo scripts
├── public/        # WebUI static files
├── docs/          # Design docs
├── SPEC.md        # Design specification
├── PLAN.md        # Implementation plan
├── AGENT_LOG.md   # Development log
├── SPEC_PROCESS.md# Spec generation process
├── REFLECTION.md  # Project reflection (1500-2500 words)
├── Dockerfile
└── render.yaml    # Render deployment config
```

## Mechanism Demos

These demos run with mock LLM — no real API key needed:

```bash
npm run demo:guardrail       # Guardrail intercepts dangerous command
npm run demo:feedback-loop   # Agent fails → feedback → retry → succeeds
npm run demo:adaptive-retry  # Repeated error → early stop
```

## Testing

```bash
npm test            # Run all tests (63 tests, all with mock LLM)
npm run test:watch  # Watch mode
```

All tests use mock LLM — no network, no real API calls. CI runs on every push.

## Architecture

**6 components + 1 loop:**

```
AgentLoop.run():
  buildContext → LLMProvider.call → ActionParser.parse
  → Guardrail.check → ToolExecutor.execute
  → Verifier.verify → (FeedbackInjector.inject | done)
```

**Key design decisions:**
- **Feedback loop** is the deep dimension (Verifier + FeedbackInjector + adaptive retry)
- **Defense-in-depth workspace isolation**: System prompt → Guardrail (path normalization) → ToolExecutor (hard-coded path sandbox)
- All mechanisms testable with mock LLM; removal of real LLM still leaves verifiable engineering

## Deployment

**Cloud:** Deployed on Render free tier at https://code-harness.onrender.com
- Spins down after 15 min inactivity, wakes on first request
- Cloud mode: upload zip → isolated workspace → agent operates → download results
- Workspace isolation enforced by 3-layer defense (prompt + guardrail + executor)

**CI/CD:** GitHub Actions runs `npm test` + `tsc --noEmit` on every push, then builds Docker image.

## Known Limitations

- Windows: `keytar` requires native module — if installation fails, use `HARNESS_API_KEY` env var
- Only OpenAI-compatible APIs supported
- Verifier regex patterns optimized for Vitest; other frameworks may not be classified correctly
- **Scope:** code-harness is a code execution and modification tool — it reads, writes, and runs code. It is not a chat or code explanation tool. Asking it to "explain what this code does" will not produce useful results; use it for concrete coding tasks like "fix this bug" or "add a feature"

## License

MIT