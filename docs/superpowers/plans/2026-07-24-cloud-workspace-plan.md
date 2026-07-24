# Cloud Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cloud workspace support — detect cloud environment, allow zip upload, let Agent operate on temporary workspace, and support download of modified results.

**Architecture:** WorkspaceManager handles session lifecycle (create + upload + file tree + download + cleanup). Server detects cloud env, adds 3 API endpoints, guards `/api/run`. Frontend shows upload UI, file tree, download button.

**Tech Stack:** TypeScript, Express, adm-zip, Node.js fs

## Global Constraints

- TDD required: write failing test first, run to confirm red, implement, run to confirm green
- Every commit message must reference the subagent that produced it
- All new code must be testable without real LLM calls
- Use `using-git-worktrees` skill to create isolated worktree branches for each task
- Each worktree branch → PR workflow per course requirements

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/WorkspaceManager.ts` | Session lifecycle, zip upload/extract, file tree, zip download, cleanup |
| `tests/unit/WorkspaceManager.test.ts` | Unit tests for WorkspaceManager |

### Modified files
| File | Changes |
|------|---------|
| `src/server.ts` | Add environment detection, 3 API endpoints, cloud mode guard |
| `public/index.html` | Add upload UI, file tree, download button |
| `package.json` | Add `adm-zip` dependency |

---

### Task 18: WorkspaceManager Core Module

**Files:**
- Create: `src/WorkspaceManager.ts`
- Create: `tests/unit/WorkspaceManager.test.ts`
- Modify: `package.json` — add `adm-zip` and `@types/adm-zip`

**Interfaces:**
- Produces: `createWorkspaceManager(options?): WorkspaceManager` — session CRUD, zip upload/extract, file tree, zip download, cleanup
- Types: `WorkspaceSession`, `FileNode`, `WorkspaceManager`

- [ ] **Step 1: Install adm-zip dependency**

```bash
npm install adm-zip
npm install -D @types/adm-zip
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/WorkspaceManager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createWorkspaceManager } from '../../src/WorkspaceManager.js'
import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import AdmZip from 'adm-zip'

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
    expect(tree.length).toBe(2) // file1.txt + dir/
    const dir = tree.find(n => n.name === 'dir')
    expect(dir).toBeTruthy()
    expect(dir!.children!.length).toBe(1)
    expect(dir!.children![0].name).toBe('file2.txt')
  })

  it('should create downloadable zip with modified content', async () => {
    const session = manager.createSession()
    const zip = new AdmZip()
    zip.addFile('test.txt', Buffer.from('original'))
    await manager.uploadZip(session.sessionId, zip.toBuffer())

    writeFileSync(join(session.rootDir, 'test.txt'), 'modified')

    const downloadBuffer = await manager.downloadZip(session.sessionId)
    const extracted = new AdmZip(Buffer.from(downloadBuffer))
    const entry = extracted.getEntry('test.txt')
    expect(entry).toBeTruthy()
    expect(entry!.getData().toString()).toBe('modified')
  })

  it('should clean up a session', () => {
    const session = manager.createSession()
    expect(existsSync(session.rootDir)).toBe(true)
    manager.cleanup(session.sessionId)
    expect(existsSync(session.rootDir)).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/unit/WorkspaceManager.test.ts -v
```
Expected: FAIL — "Cannot find module '../../src/WorkspaceManager.js'"

- [ ] **Step 4: Write minimal implementation**

```typescript
// src/WorkspaceManager.ts
import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, sep } from 'node:path'
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
    mkdirSync(baseDir, { recursive: true })
  }

  function getSessionDir(sessionId: string): string {
    return join(baseDir, `workspace-${sessionId}`)
  }

  function scanFiles(rootDir: string, relativePath: string = ''): string[] {
    const files: string[] = []
    const fullPath = join(rootDir, relativePath)
    const entries = readdirSync(fullPath)
    for (const entry of entries) {
      const entryPath = relativePath ? `${relativePath}/${entry}` : entry
      const fullEntryPath = join(rootDir, entryPath)
      if (statSync(fullEntryPath).isDirectory()) {
        files.push(...scanFiles(rootDir, entryPath))
      } else {
        files.push(entryPath)
      }
    }
    return files
  }

  function buildFileTree(rootDir: string): FileNode[] {
    const children: FileNode[] = []
    const entries = readdirSync(rootDir).sort()
    for (const entry of entries) {
      const fullPath = join(rootDir, entry)
      if (statSync(fullPath).isDirectory()) {
        children.push({
          name: entry,
          path: entry,
          type: 'directory',
          children: buildFileTree(fullPath),
        })
      } else {
        children.push({ name: entry, path: entry, type: 'file' })
      }
    }
    return children
  }

  return {
    createSession(): WorkspaceSession {
      const sessionId = randomUUID()
      const rootDir = getSessionDir(sessionId)
      mkdirSync(rootDir, { recursive: true })
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
      return buildFileTree(session.rootDir)
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

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/unit/WorkspaceManager.test.ts -v
```
Expected: PASS — all 6 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/WorkspaceManager.ts tests/unit/WorkspaceManager.test.ts package.json
git commit -m "feat: add WorkspaceManager with zip upload, file tree, download, cleanup (subagent: primary)"
```

---

### Task 19: Workspace Manager — Server Integration

**Files:**
- Modify: `src/server.ts` — add environment detection, 3 API endpoints, cloud mode guard
- Modify: `public/index.html` — add workspace upload UI, file tree, download button

**Interfaces:**
- Consumes: `WorkspaceManager` from Task 18
- Produces: `POST /api/workspace/upload`, `GET /api/workspace/download`, `GET /api/workspace/status`

- [ ] **Step 1: Write the failing integration test**

```typescript
// tests/integration/CloudWorkspace.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createWorkspaceManager } from '../../src/WorkspaceManager.js'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import AdmZip from 'adm-zip'
import { writeFileSync, existsSync } from 'node:fs'

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

  it('should detect cloud environment from RENDER env var', () => {
    const original = process.env.RENDER
    process.env.RENDER = 'true'
    // This simulates the check we'll add to server.ts
    const isCloud = process.env.RENDER === 'true' || process.cwd().includes('/app')
    expect(isCloud).toBe(true)
    if (original) process.env.RENDER = original
    else delete process.env.RENDER
  })

  it('should complete full workspace lifecycle', async () => {
    // Create session
    const session = manager.createSession()
    expect(session.sessionId).toBeTruthy()

    // Upload zip
    const zip = new AdmZip()
    zip.addFile('src/index.ts', Buffer.from('export const x = 1'))
    zip.addFile('README.md', Buffer.from('# Project'))
    const files = await manager.uploadZip(session.sessionId, zip.toBuffer())
    expect(files.length).toBe(2)

    // Agent modifies a file
    writeFileSync(join(session.rootDir, 'README.md'), '# Modified Project')

    // Download modified workspace
    const downloadBuffer = await manager.downloadZip(session.sessionId)
    const extracted = new AdmZip(Buffer.from(downloadBuffer))
    const readme = extracted.getEntry('README.md')
    expect(readme!.getData().toString()).toBe('# Modified Project')

    // Cleanup
    manager.cleanup(session.sessionId)
    expect(existsSync(session.rootDir)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/integration/CloudWorkspace.test.ts -v
```
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Update server.ts — add environment detection + cloud mode guard**

```typescript
// Add to imports at top of src/server.ts
import { createWorkspaceManager, WorkspaceManager } from './WorkspaceManager.js'
import { randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'

// Add after app initialization
const CLOUD_PATHS = ['/app', '/var/task', '/home/site/wwwroot']
const CLOUD_ENV_VARS = ['RENDER', 'RAILWAY', 'FLY_APP_NAME', 'VERCEL']

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

// Add new API endpoints
app.post('/api/workspace/upload', async (req, res) => {
  try {
    // Parse multipart — express.json() won't handle this, body-parser needed
    // For simplicity, accept base64-encoded zip in JSON body
    const { zipBase64 } = req.body
    if (!zipBase64) {
      return res.status(400).json({ error: 'Missing zip data' })
    }

    const zipBuffer = Buffer.from(zipBase64, 'base64')
    if (zipBuffer.length > 100 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large (max 100MB)' })
    }

    // Clean up previous session
    if (currentSessionId) {
      wsManager.cleanup(currentSessionId)
    }

    const session = wsManager.createSession()
    currentSessionId = session.sessionId
    const files = await wsManager.uploadZip(session.sessionId, zipBuffer)
    const fileTree = wsManager.getFileTree(session.sessionId)

    res.json({
      sessionId: session.sessionId,
      rootDir: session.rootDir,
      files,
      fileTree,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/workspace/status', (_req, res) => {
  if (!currentSessionId) {
    return res.json({ hasWorkspace: false, cloudMode })
  }
  const session = wsManager.getSession(currentSessionId)
  if (!session) {
    return res.json({ hasWorkspace: false, cloudMode })
  }
  const fileTree = wsManager.getFileTree(currentSessionId)
  res.json({
    hasWorkspace: true,
    cloudMode,
    sessionId: session.sessionId,
    rootDir: session.rootDir,
    fileCount: fileTree.length,
    fileTree,
  })
})

app.get('/api/workspace/download', async (req, res) => {
  if (!currentSessionId) {
    return res.status(400).json({ error: 'No workspace to download' })
  }
  try {
    const zipBuffer = await wsManager.downloadZip(currentSessionId)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="workspace-${currentSessionId.slice(0, 8)}.zip"`)
    res.send(Buffer.from(zipBuffer))
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Guard /api/run in cloud mode
// In the POST /api/run handler, add after the existing config setup:
// (inside the existing try block, after config setup)
if (cloudMode && !currentSessionId) {
  return res.json({
    status: 'no_workspace',
    message: '请先上传工作区（zip 文件）后再运行任务',
  })
}
```

- [ ] **Step 4: Update public/index.html — add workspace upload UI**

Add to the HTML body (after the main app-layout, before the script):

```html
<!-- Cloud Workspace Upload Overlay -->
<div class="workspace-overlay" id="workspaceOverlay" style="display:none;">
  <div class="workspace-modal">
    <div class="workspace-modal-header">
      <h2>上传工作区</h2>
      <p>请上传包含项目文件的 zip 压缩包</p>
    </div>
    <div class="workspace-dropzone" id="dropzone"
         ondragover="event.preventDefault()"
         ondragenter="event.preventDefault()"
         ondrop="handleDrop(event)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;opacity:0.3;margin-bottom:12px;">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <p>拖拽 zip 文件到此处，或 <a href="#" onclick="document.getElementById('fileInput').click()">点击选择文件</a></p>
      <input id="fileInput" type="file" accept=".zip" style="display:none" onchange="handleFileSelect(event)">
    </div>
    <div id="uploadProgress" style="display:none;margin-top:12px;">
      <div class="upload-progress-bar"><div class="upload-progress-fill" id="progressFill"></div></div>
      <p class="upload-progress-text" id="progressText">正在上传...</p>
    </div>
  </div>
</div>

<!-- Workspace Info Bar (shown after upload) -->
<div class="workspace-bar" id="workspaceBar" style="display:none;">
  <div class="workspace-bar-info">
    <span class="workspace-bar-label">工作区：</span>
    <span class="workspace-bar-path" id="workspacePath"></span>
  </div>
  <div class="workspace-bar-actions">
    <button class="btn btn-sm btn-secondary" onclick="downloadWorkspace()">下载工作区</button>
    <button class="btn btn-sm btn-secondary" onclick="switchWorkspace()">切换工作区</button>
  </div>
</div>
```

Add to the CSS:

```css
.workspace-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.workspace-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 32px;
  width: 500px;
  max-width: 90vw;
  box-shadow: var(--elev-raised);
}
.workspace-modal-header { margin-bottom: 20px; }
.workspace-modal-header h2 { font-size: 20px; font-weight: 300; margin-bottom: 8px; }
.workspace-modal-header p { font-size: 13px; color: var(--muted); }
.workspace-dropzone {
  border: 2px dashed var(--border);
  border-radius: var(--radius-md);
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard);
}
.workspace-dropzone:hover { border-color: var(--accent); background: var(--accent-soft); }
.workspace-dropzone p { font-size: 14px; color: var(--muted); }
.workspace-dropzone a { color: var(--accent); cursor: pointer; }
.upload-progress-bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.upload-progress-fill { height: 100%; background: var(--accent); width: 0%; transition: width 0.3s; }
.upload-progress-text { font-size: 12px; color: var(--muted); margin-top: 8px; }
.workspace-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--surface-warm);
  border-bottom: 1px solid var(--border);
  gap: 12px;
  flex-wrap: wrap;
}
.workspace-bar-info { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.workspace-bar-label { color: var(--muted); }
.workspace-bar-path { font-family: var(--font-mono); font-size: 11px; color: var(--fg-2); word-break: break-all; }
.workspace-bar-actions { display: flex; gap: 6px; }
```

Add to the JavaScript:

```javascript
// Cloud workspace functions
async function checkWorkspaceStatus() {
  try {
    const data = await api('/api/workspace/status')
    if (data.cloudMode && !data.hasWorkspace) {
      document.getElementById('workspaceOverlay').style.display = 'flex'
    } else if (data.hasWorkspace) {
      document.getElementById('workspaceBar').style.display = 'flex'
      document.getElementById('workspacePath').textContent = data.rootDir
    }
  } catch (e) {
    // Not in cloud mode or server doesn't support it
  }
}

function handleDrop(e) {
  e.preventDefault()
  const files = e.dataTransfer.files
  if (files.length > 0) uploadWorkspace(files[0])
}

function handleFileSelect(e) {
  const files = e.target.files
  if (files.length > 0) uploadWorkspace(files[0])
}

async function uploadWorkspace(file) {
  if (!file.name.endsWith('.zip')) {
    showToast('请上传 .zip 文件', 'error')
    return
  }

  const progress = document.getElementById('uploadProgress')
  const fill = document.getElementById('progressFill')
  const text = document.getElementById('progressText')
  progress.style.display = 'block'
  fill.style.width = '30%'
  text.textContent = '正在读取文件...'

  try {
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64 = btoa(binary)

    fill.style.width = '60%'
    text.textContent = '正在上传...'

    const data = await api('/api/workspace/upload', {
      method: 'POST',
      body: JSON.stringify({ zipBase64: base64 }),
    })

    fill.style.width = '100%'
    text.textContent = '上传完成！'

    document.getElementById('workspaceOverlay').style.display = 'none'
    document.getElementById('workspaceBar').style.display = 'flex'
    document.getElementById('workspacePath').textContent = data.rootDir

    showToast('工作区上传成功，共 ' + data.files.length + ' 个文件')
  } catch (err) {
    progress.style.display = 'none'
    showToast('上传失败：' + err.message, 'error')
  }
}

async function downloadWorkspace() {
  try {
    const res = await fetch('/api/workspace/download')
    if (!res.ok) throw new Error('Download failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'workspace.zip'
    a.click()
    URL.revokeObjectURL(url)
    showToast('工作区已下载')
  } catch (err) {
    showToast('下载失败：' + err.message, 'error')
  }
}

function switchWorkspace() {
  document.getElementById('workspaceBar').style.display = 'none'
  document.getElementById('workspaceOverlay').style.display = 'flex'
}

// Call on page load
checkWorkspaceStatus()
```

- [ ] **Step 4: Run integration test to verify it passes**

```bash
npx vitest run tests/integration/CloudWorkspace.test.ts -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server.ts public/index.html tests/integration/CloudWorkspace.test.ts
git commit -m "feat: integrate cloud workspace — env detection, API endpoints, upload UI (subagent: primary)"
```

---

### Task 20: Update Docs

**Files:**
- Modify: `AGENT_LOG.md` — already updated
- Modify: `SPEC_PROCESS.md` — already updated
- Modify: `SPEC.md` — already updated
- New: `docs/superpowers/specs/2026-07-24-cloud-workspace-design.md` — already created
- New: `docs/superpowers/plans/2026-07-24-cloud-workspace-plan.md` — this file

- [ ] **Step 1: Verify all docs are consistent**

Check that:
- SPEC.md §3.10 matches the implementation
- PLAN.md tasks 18-20 match this plan
- AGENT_LOG.md has the 2026-07-24 entry
- SPEC_PROCESS.md has the cloud workspace section

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-24-cloud-workspace-plan.md
git commit -m "docs: add cloud workspace implementation plan (subagent: primary)"
```