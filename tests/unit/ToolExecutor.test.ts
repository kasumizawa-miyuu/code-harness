import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createToolExecutor } from '../../src/ToolExecutor.js'
import { createAction } from '../../src/types.js'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
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

describe('ToolExecutor with allowedPaths', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'harness-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should block read_file outside allowedPaths', async () => {
    const exec = createToolExecutor({ toolTimeout: 5000, allowedPaths: [tmpDir] })
    const result = await exec.execute(createAction('read_file', { path: '/etc/passwd' }))
    expect(result.success).toBe(false)
    expect(result.stderr).toContain('outside workspace')
  })

  it('should allow read_file within allowedPaths', async () => {
    const exec = createToolExecutor({ toolTimeout: 5000, allowedPaths: [tmpDir] })
    const testFile = join(tmpDir, 'test.txt')
    writeFileSync(testFile, 'hello', 'utf-8')
    const result = await exec.execute(createAction('read_file', { path: testFile }))
    expect(result.success).toBe(true)
    expect(result.stdout).toBe('hello')
  })

  it('should block read_file with path traversal', async () => {
    const exec = createToolExecutor({ toolTimeout: 5000, allowedPaths: [tmpDir] })
    const result = await exec.execute(createAction('read_file', { path: tmpDir + '/../' + 'etc/passwd' }))
    expect(result.success).toBe(false)
    expect(result.stderr).toContain('outside workspace')
  })

  it('should block write_file outside allowedPaths', async () => {
    const exec = createToolExecutor({ toolTimeout: 5000, allowedPaths: [tmpDir] })
    const result = await exec.execute(createAction('write_file', { path: '/etc/hack', content: 'bad' }))
    expect(result.success).toBe(false)
    expect(result.stderr).toContain('outside workspace')
  })

  it('should block run_command with path outside workspace', async () => {
    const exec = createToolExecutor({ toolTimeout: 5000, allowedPaths: [tmpDir], workDir: tmpDir })
    const result = await exec.execute(createAction('run_command', { command: 'cat /etc/passwd' }))
    expect(result.success).toBe(false)
    expect(result.stderr).toContain('outside workspace')
  })

  it('should allow run_command within workspace', async () => {
    const exec = createToolExecutor({ toolTimeout: 5000, allowedPaths: [tmpDir], workDir: tmpDir })
    const result = await exec.execute(createAction('run_command', { command: 'echo workspace-test' }))
    expect(result.success).toBe(true)
    expect(result.stdout.trim()).toBe('workspace-test')
  })

  it('should run command in workDir', async () => {
    const subDir = join(tmpDir, 'subdir')
    const { mkdirSync } = require('node:fs')
    mkdirSync(subDir)
    const exec = createToolExecutor({ toolTimeout: 5000, allowedPaths: [tmpDir], workDir: subDir })
    const result = await exec.execute(createAction('run_command', { command: 'node -e "console.log(process.cwd())"' }))
    expect(result.success).toBe(true)
    expect(result.stdout.trim()).toBe(subDir)
  })
})