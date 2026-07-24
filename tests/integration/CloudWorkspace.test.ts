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