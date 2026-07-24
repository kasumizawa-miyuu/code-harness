# Task 18: WorkspaceManager Core Module

**Files:**
- Create: `src/WorkspaceManager.ts`
- Create: `tests/unit/WorkspaceManager.test.ts`
- Modify: `package.json` — add `adm-zip` and `@types/adm-zip`

## Interfaces

Produces:
- `createWorkspaceManager(options?: { baseDir?: string }): WorkspaceManager`
- `interface WorkspaceManager { createSession(): WorkspaceSession; uploadZip(sessionId, zipBuffer): Promise<string[]>; getFileTree(sessionId): FileNode[]; downloadZip(sessionId): Promise<Buffer>; cleanup(sessionId): void; cleanupAll(): void; getSession(sessionId): WorkspaceSession | undefined }`
- `interface WorkspaceSession { sessionId: string; rootDir: string; createdAt: number }`
- `interface FileNode { name: string; path: string; type: 'file' | 'directory'; children?: FileNode[] }`

## Implementation Steps

### Step 1: Install adm-zip dependency

```bash
npm install adm-zip
npm install -D @types/adm-zip
```

### Step 2: Write the failing test

Create `tests/unit/WorkspaceManager.test.ts` with these tests:
1. `should create a session with unique ID` — sessionId is truthy, rootDir contains sessionId, rootDir directory exists
2. `should extract zip and preserve directory structure` — upload zip with nested files, verify all extracted, verify files exist on disk
3. `should reject path traversal attacks in zip` — zip with `../../etc/passwd` entry, expect reject
4. `should return file tree` — upload with nested dirs, verify tree structure (file1.txt + dir/ with file2.txt inside)
5. `should create downloadable zip with modified content` — upload, modify file on disk, download, verify zip contains modified content
6. `should clean up a session` — create session, cleanup, verify directory removed

### Step 3: Run test to verify it fails

```bash
npx vitest run tests/unit/WorkspaceManager.test.ts -v
```
Expected: FAIL — "Cannot find module '../../src/WorkspaceManager.js'"

### Step 4: Write minimal implementation

Create `src/WorkspaceManager.ts` with:
- `createWorkspaceManager` factory function
- Sessions stored in Map<string, WorkspaceSession>
- Session directory: `{baseDir}/workspace-{sessionId}`
- `createSession()`: generate UUID, create dir, store session
- `uploadZip()`: use adm-zip to extract, path traversal check (reject `..`), skip directories, return file list
- `getFileTree()`: recursive directory scan, return sorted FileNode tree
- `downloadZip()`: scan all files, add to adm-zip, return buffer
- `cleanup()`: rm -rf session dir, delete from map
- `cleanupAll()`: cleanup all sessions
- `getSession()`: return session by ID

### Step 5: Run test to verify it passes

```bash
npx vitest run tests/unit/WorkspaceManager.test.ts -v
```
Expected: PASS — all 6 tests pass

### Step 6: Commit

```bash
git add src/WorkspaceManager.ts tests/unit/WorkspaceManager.test.ts package.json
git commit -m "feat: add WorkspaceManager with zip upload, file tree, download, cleanup (subagent: primary)"
```