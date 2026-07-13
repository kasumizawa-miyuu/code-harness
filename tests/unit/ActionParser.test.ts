import { describe, it, expect } from 'vitest'
import { createActionParser } from '../../src/ActionParser.js'

describe('ActionParser', () => {
  const parser = createActionParser()

  it('should parse read_file action', () => {
    const action = parser.parse('read_file path="src/foo.ts"')
    expect(action).not.toBeNull()
    expect(action!.type).toBe('read_file')
    expect(action!.params.path).toBe('src/foo.ts')
  })

  it('should parse write_file action', () => {
    const action = parser.parse('write_file path="src/foo.ts" content="console.log(1)"')
    expect(action).not.toBeNull()
    expect(action!.type).toBe('write_file')
    expect(action!.params.content).toBe('console.log(1)')
  })

  it('should parse run_command action', () => {
    const action = parser.parse('run_command command="npm test"')
    expect(action).not.toBeNull()
    expect(action!.type).toBe('run_command')
    expect(action!.params.command).toBe('npm test')
  })

  it('should parse run_test action', () => {
    const action = parser.parse('run_test test="tests/foo.test.ts"')
    expect(action).not.toBeNull()
    expect(action!.type).toBe('run_test')
    expect(action!.params.test).toBe('tests/foo.test.ts')
  })

  it('should return null for unparseable text', () => {
    expect(parser.parse('hello world')).toBeNull()
  })

  it('should parse action from text with surrounding content', () => {
    const text = `I'll fix the bug now.\nrun_command command="npm test"\nThis should work.`
    const action = parser.parse(text)
    expect(action).not.toBeNull()
    expect(action!.type).toBe('run_command')
  })
})