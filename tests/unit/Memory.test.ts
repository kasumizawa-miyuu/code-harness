import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemory } from '../../src/Memory.js'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'

describe('Memory', () => {
  let tmpDir: string
  let memFile: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'harness-mem-'))
    memFile = join(tmpDir, 'test-memory.json')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should store and retrieve values', () => {
    const mem = createMemory(memFile)
    mem.set('key1', 'value1')
    expect(mem.get('key1')).toBe('value1')
  })

  it('should return undefined for missing keys', () => {
    const mem = createMemory(memFile)
    expect(mem.get('nonexistent')).toBeUndefined()
  })

  it('should persist to file', () => {
    const mem1 = createMemory(memFile)
    mem1.set('persist', 'data')
    const mem2 = createMemory(memFile)
    expect(mem2.get('persist')).toBe('data')
  })

  it('should enforce sliding window of 20 items', () => {
    const mem = createMemory(memFile)
    for (let i = 0; i < 25; i++) {
      mem.set(`key${i}`, `value${i}`)
    }
    expect(mem.get('key0')).toBeUndefined()
    expect(mem.get('key24')).toBe('value24')
  })
})