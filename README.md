# code-harness

A lightweight, feedback-loop-driven Coding Agent Harness. Built for the AI4SE final project.

## Quick Start

### Option 1: CLI (direct access to local files)

```bash
# Install
git clone https://github.com/kasumizawa-miyuu/code-harness.git
cd code-harness
npm install
npm run build
npm link

# Configure
harness configure
harness key update

# Run a task
harness run "fix the failing test"
```

### Option 2: Docker (WebUI with local file access)

```bash
docker build -t code-harness .
docker run -v $(pwd):/workspace -w /workspace -p 3000:3000 code-harness
```

Then open http://localhost:3000. The `-v $(pwd):/workspace` mount gives the WebUI access to your current directory's files.

### Option 3: Deployed WebUI

Visit the deployed instance (no installation needed), but the WebUI operates on the server's filesystem. Use Docker volume mounts to connect your local files.

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

- API keys are stored in your OS keychain via `keytar` (Windows Credential Manager / macOS Keychain / Linux Secret Service)
- The `HARNESS_API_KEY` environment variable is supported as a fallback (note: .env files are plaintext, process environments are visible to other processes on the same machine)
- Keys are never hardcoded, logged, or committed to git

## Distribution

### npm

```bash
npm install -g @student/code-harness
```

### Docker

Build and run with local file access:

```bash
docker build -t code-harness .
docker run -v $(pwd):/workspace -w /workspace -p 3000:3000 code-harness
```

The `-v $(pwd):/workspace` mount makes your current directory available to the agent inside the container at `/workspace`. The `-p 3000:3000` exposes the WebUI on your local machine.

### npm

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
├── public/        # WebUI static files
├── docs/          # Design docs and plans
├── SPEC.md
├── PLAN.md
├── README.md
├── Dockerfile
└── render.yaml
```

## WebUI

Start the web interface:

```bash
harness serve
```

Open http://localhost:3000 in your browser.

The WebUI includes a **User Guide** modal with instructions on Docker volume mounts, CLI usage, and the GitHub repository link.

### Deploy to Render

The project is deployed at: **https://code-harness.onrender.com**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://dashboard.render.com/)

## Known Limitations

- Windows: keytar requires the `keytar` native module — if installation fails, use `HARNESS_API_KEY` env var
- Only OpenAI-compatible APIs supported currently
- Verifier regex patterns optimized for Jest/Vitest output; other test frameworks may not be classified correctly

## License

MIT