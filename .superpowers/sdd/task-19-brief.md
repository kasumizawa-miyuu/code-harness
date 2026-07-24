# Task 19: Cloud Workspace — Server Integration

**Files:**
- Modify: `src/server.ts` — add environment detection, 3 API endpoints, cloud mode guard
- Modify: `public/index.html` — add workspace upload UI, file tree, download button
- Create: `tests/integration/CloudWorkspace.test.ts` — integration test

## Interfaces

Consumes:
- `WorkspaceManager` from `src/WorkspaceManager.ts` (Task 18)
- `createWorkspaceManager(options?)` factory function

## Implementation Steps

### Step 1: Write the failing integration test

Create `tests/integration/CloudWorkspace.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createWorkspaceManager } from '../../src/WorkspaceManager.js'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import AdmZip from 'adm-zip'

describe('CloudWorkspace Integration', () => {
  let baseDir: string
  let manager: ReturnType<typeof createWorkspaceManager>

  beforeAll(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'harness-cloud-test-'))
    manager = createWorkspaceManager({ baseDir })
  })

  afterAll(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  it('should complete full workspace lifecycle', async () => {
    const session = manager.createSession()
    expect(session.sessionId).toBeTruthy()

    const zip = new AdmZip()
    zip.addFile('src/index.ts', Buffer.from('export const x = 1'))
    zip.addFile('README.md', Buffer.from('# Project'))
    const files = await manager.uploadZip(session.sessionId, zip.toBuffer())
    expect(files.length).toBe(2)

    writeFileSync(join(session.rootDir, 'README.md'), '# Modified Project')

    const downloadBuffer = await manager.downloadZip(session.sessionId)
    const extracted = new AdmZip(Buffer.from(downloadBuffer))
    const readme = extracted.getEntry('README.md')
    expect(readme!.getData().toString()).toBe('# Modified Project')

    manager.cleanup(session.sessionId)
    expect(existsSync(session.rootDir)).toBe(false)
  })
})
```

### Step 2: Update `src/server.ts`

Add to imports:
```typescript
import { createWorkspaceManager } from './WorkspaceManager.js'
```

Add after `app.use(express.static(...))`:

```typescript
// Environment detection
const CLOUD_PATHS = ['/app', '/var/task', '/home/site/wwwroot']
const CLOUD_ENV_VARS = ['RENDER', 'RAILWAY', 'FLY_APP_NAME', 'VERCEL', 'CODEX']

function isCloudEnvironment(): boolean {
  for (const envVar of CLOUD_ENV_VARS) {
    if (process.env[envVar]) return true
  }
  const cwd = process.cwd()
  for (const path of CLOUD_PATHS) {
    if (cwd.startsWith(path)) return true
  }
  return false
}

const cloudMode = isCloudEnvironment()
const wsManager = createWorkspaceManager()
let currentSessionId: string | null = null
```

Add 3 new API endpoints:

**POST /api/workspace/upload** — accepts `{ zipBase64: string }`, validates size (100MB max), cleans previous session, creates new session, uploads zip, returns `{ sessionId, rootDir, files, fileTree }`.

**GET /api/workspace/status** — returns `{ hasWorkspace, cloudMode, sessionId?, rootDir?, fileCount?, fileTree? }`.

**GET /api/workspace/download** — returns `application/zip` with `Content-Disposition: attachment`.

**Guard in POST /api/run**: If `cloudMode && !currentSessionId`, return `{ status: 'no_workspace', message: '请先上传工作区（zip 文件）后再运行任务' }`.

### Step 3: Update `public/index.html`

Add workspace overlay HTML (upload modal with drag-and-drop zone, file input, progress bar).

Add workspace bar HTML (shows rootDir path, download/switch buttons).

Add CSS for overlay, dropzone, progress bar, workspace bar.

Add JavaScript functions:
- `checkWorkspaceStatus()` — calls `/api/workspace/status`, shows overlay or bar
- `handleDrop(e)` — handles drag-and-drop
- `handleFileSelect(e)` — handles file picker
- `uploadWorkspace(file)` — reads file as base64, POSTs to `/api/workspace/upload`, shows progress
- `downloadWorkspace()` — fetches `/api/workspace/download`, creates blob URL, triggers download
- `switchWorkspace()` — hides bar, shows overlay

### Step 4: Run tests

```bash
npx vitest run tests/integration/CloudWorkspace.test.ts -v
```
Expected: PASS

```bash
npx vitest run
```
Expected: All tests pass

### Step 5: Commit

```bash
git add src/server.ts public/index.html tests/integration/CloudWorkspace.test.ts
git commit -m "feat: integrate cloud workspace — env detection, API endpoints, upload UI (subagent: primary)"
```

## Key Design Decisions

1. **Base64 encoding** for upload (not multipart) — works with Express JSON body parser, no extra middleware needed
2. **Temp dir** via WorkspaceManager — no need to manage file paths in server.ts
3. **Overlay pattern** for upload UI — blocks interaction until workspace is uploaded, clear user flow
4. **Workspace bar** after upload — shows current state, allows download/switch without leaving the page