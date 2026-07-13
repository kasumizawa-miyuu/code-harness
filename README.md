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