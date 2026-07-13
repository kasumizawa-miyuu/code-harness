import { Action, ActionType, IActionParser, createAction } from './types.js'

const ACTION_PATTERNS: { type: ActionType; regex: RegExp }[] = [
  { type: 'read_file', regex: /read_file\s+path="([^"]*)"/ },
  { type: 'write_file', regex: /write_file\s+path="([^"]*)"\s+content="([^"]*)"/ },
  { type: 'patch_file', regex: /patch_file\s+path="([^"]*)"\s+content="([^"]*)"/ },
  { type: 'run_command', regex: /run_command\s+command="([^"]*)"/ },
  { type: 'run_test', regex: /run_test\s+test="([^"]*)"/ },
]

export function createActionParser(): IActionParser {
  return {
    parse(raw: string): Action | null {
      for (const { type, regex } of ACTION_PATTERNS) {
        const match = raw.match(regex)
        if (match) {
          const params: Record<string, string> = {}
          if (type === 'read_file') {
            params.path = match[1]
          } else if (type === 'run_command') {
            params.command = match[1]
          } else if (type === 'run_test') {
            params.test = match[1]
          } else {
            params.path = match[1]
            params.content = match[2]
          }
          return createAction(type, params)
        }
      }
      return null
    },
  }
}