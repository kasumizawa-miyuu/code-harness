import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createWorkspaceManager } from '../../src/WorkspaceManager.js'
import AdmZip from 'adm-zip'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'

describe('WorkspaceManager', () => {
  let baseDir: string

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'harness-ws-'))
  })

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  it('should create a session with unique ID', () => {
    const wm = createWorkspaceManager({ baseDir })
    const session = wm.createSession()
    expect(session.sessionId).toBeTruthy()
    expect(session.rootDir).toContain(session.sessionId)
    expect(existsSync(session.rootDir)).toBe(true)
  })

  it('should extract zip and preserve directory structure', async () => {
    const wm = createWorkspaceManager({ baseDir })
    const session = wm.createSession()

    const zip = new AdmZip()
    zip.addFile('hello.txt', Buffer.from('world'))
    zip.addFile('sub/dir/nested.txt', Buffer.from('nested content'))
    const buf = zip.toBuffer()

    const files = await wm.uploadZip(session.sessionId, buf)
    expect(files).toContain('hello.txt')
    expect(files).toContain('sub/dir/nested.txt')

    expect(existsSync(join(session.rootDir, 'hello.txt'))).toBe(true)
    expect(existsSync(join(session.rootDir, 'sub/dir/nested.txt'))).toBe(true)
    expect(readFileSync(join(session.rootDir, 'hello.txt'), 'utf-8')).toBe('world')
    expect(readFileSync(join(session.rootDir, 'sub/dir/nested.txt'), 'utf-8')).toBe('nested content')
  })

  it('should reject path traversal attacks in zip', async () => {
    const wm = createWorkspaceManager({ baseDir })
    const session = wm.createSession()

    // AdmZip normalizes paths on addFile, so we construct a raw zip with a traversal path
    const traversal = '../../etc/passwd'
    const zip = new AdmZip()
    zip.addFile('x'.repeat(traversal.length), Buffer.from('evil'))
    zip.getEntries()[0].rawEntryName.write(traversal)
    const buf = zip.toBuffer()

    await expect(wm.uploadZip(session.sessionId, buf)).rejects.toThrow(/traversal|\.\.|invalid/)
  })

  it('should return file tree', async () => {
    const wm = createWorkspaceManager({ baseDir })
    const session = wm.createSession()

    const zip = new AdmZip()
    zip.addFile('file1.txt', Buffer.from('a'))
    zip.addFile('dir/file2.txt', Buffer.from('b'))
    const buf = zip.toBuffer()

    await wm.uploadZip(session.sessionId, buf)

    const tree = wm.getFileTree(session.sessionId)
    expect(tree).toBeDefined()

    const file1 = tree.find(n => n.name === 'file1.txt')
    expect(file1).toBeDefined()
    expect(file1!.type).toBe('file')

    const dirNode = tree.find(n => n.name === 'dir')
    expect(dirNode).toBeDefined()
    expect(dirNode!.type).toBe('directory')
    expect(dirNode!.children).toBeDefined()
    expect(dirNode!.children).toHaveLength(1)
    expect(dirNode!.children![0].name).toBe('file2.txt')
    expect(dirNode!.children![0].type).toBe('file')
  })

  it('should create downloadable zip with modified content', async () => {
    const wm = createWorkspaceManager({ baseDir })
    const session = wm.createSession()

    const zip = new AdmZip()
    zip.addFile('file.txt', Buffer.from('original'))
    const buf = zip.toBuffer()

    await wm.uploadZip(session.sessionId, buf)

    writeFileSync(join(session.rootDir, 'file.txt'), 'modified')

    const downloaded = await wm.downloadZip(session.sessionId)
    const outZip = new AdmZip(downloaded)
    const entry = outZip.getEntry('file.txt')
    expect(entry).toBeDefined()
    expect(entry!.getData().toString('utf-8')).toBe('modified')
  })

  it('should clean up a session', () => {
    const wm = createWorkspaceManager({ baseDir })
    const session = wm.createSession()
    expect(existsSync(session.rootDir)).toBe(true)

    wm.cleanup(session.sessionId)
    expect(existsSync(session.rootDir)).toBe(false)
    expect(wm.getSession(session.sessionId)).toBeUndefined()
  })
})