import AdmZip from 'adm-zip'
import { randomUUID } from 'node:crypto'
import { join, relative, resolve, sep } from 'node:path'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'

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

export function createWorkspaceManager(options?: { baseDir?: string }): WorkspaceManager {
  const baseDir = options?.baseDir ?? join(process.cwd(), '.workspaces')
  const sessions = new Map<string, WorkspaceSession>()

  function createSession(): WorkspaceSession {
    const sessionId = randomUUID()
    const rootDir = join(baseDir, `workspace-${sessionId}`)
    mkdirSync(rootDir, { recursive: true })
    const session: WorkspaceSession = { sessionId, rootDir, createdAt: Date.now() }
    sessions.set(sessionId, session)
    return session
  }

  async function uploadZip(sessionId: string, zipBuffer: Buffer): Promise<string[]> {
    const session = sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    const zip = new AdmZip(zipBuffer)
    const entries = zip.getEntries()
    const extracted: string[] = []

    for (const entry of entries) {
      if (entry.isDirectory) continue

      const entryPath = entry.entryName.replace(/\\/g, '/')
      const targetPath = resolve(join(session.rootDir, entryPath))

      const rootDir = resolve(session.rootDir) + sep
      if (!targetPath.startsWith(rootDir)) {
        throw new Error(`Path traversal detected in zip entry: ${entryPath}`)
      }

      const dir = join(targetPath, '..')
      mkdirSync(dir, { recursive: true })
      writeFileSync(targetPath, entry.getData())
      extracted.push(entryPath)
    }

    return extracted
  }

  function getFileTree(sessionId: string): FileNode[] {
    const session = sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    return buildTree(session.rootDir)
  }

  function buildTree(dir: string): FileNode[] {
    const entries = readdirSync(dir, { withFileTypes: true })
    const nodes: FileNode[] = []

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
const relPath = relative(dir, fullPath).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: relPath,
          type: 'directory',
          children: buildTree(fullPath),
        })
      } else {
        nodes.push({
          name: entry.name,
          path: relPath,
          type: 'file',
        })
      }
    }

    nodes.sort((a, b) => a.name.localeCompare(b.name))
    return nodes
  }

  async function downloadZip(sessionId: string): Promise<Buffer> {
    const session = sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    const zip = new AdmZip()
    addDirToZip(zip, session.rootDir, session.rootDir)
    return zip.toBuffer()
  }

  function addDirToZip(zip: AdmZip, dir: string, baseDir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        addDirToZip(zip, fullPath, baseDir)
      } else {
const relPath = relative(baseDir, fullPath).replace(/\\/g, '/')
        zip.addFile(relPath, readFileSync(fullPath))
      }
    }
  }

  function cleanup(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (!session) return
    rmSync(session.rootDir, { recursive: true, force: true })
    sessions.delete(sessionId)
  }

  function cleanupAll(): void {
    for (const sessionId of sessions.keys()) {
      cleanup(sessionId)
    }
  }

  function getSession(sessionId: string): WorkspaceSession | undefined {
    return sessions.get(sessionId)
  }

  return { createSession, uploadZip, getFileTree, downloadZip, cleanup, cleanupAll, getSession }
}