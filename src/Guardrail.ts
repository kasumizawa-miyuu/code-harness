import { Action, GuardResult, IGuardrail } from './types.js'

export function createGuardrail(config: { dangerousCommands: string[]; allowedPaths: string[] }): IGuardrail {
  return {
    async check(action: Action): Promise<GuardResult> {
      if (action.type === 'run_command' || action.type === 'run_test') {
        const cmd = action.params.command || action.params.test || ''
        for (const dangerous of config.dangerousCommands) {
          if (cmd.includes(dangerous)) {
            return { allowed: false, reason: `dangerous command blocked: ${dangerous}` }
          }
        }
      }

      if (action.type === 'read_file' || action.type === 'write_file' || action.type === 'patch_file') {
        const path = action.params.path || ''
        const allowed = config.allowedPaths.some((p: string) => path.startsWith(p))
        if (!allowed) {
          return { allowed: false, reason: `path not in allowed list: ${path}` }
        }
      }

      if (action.type === 'run_command' || action.type === 'run_test') {
        const cmd = action.params.command || action.params.test || ''
        if (config.allowedPaths && config.allowedPaths.length > 0) {
          const pathRefs = cmd.match(/\/(?:[^\s"'`|&;()]+[/])?[^\s"'`|&;()]+/g) || []
          for (const ref of pathRefs) {
            if (ref.startsWith('/usr/') || ref.startsWith('/bin/') || ref.startsWith('/lib/') ||
                ref.startsWith('/dev/') || ref.startsWith('/proc/') || ref.startsWith('/sys/') || ref === '/') {
              continue
            }
            const allowed = config.allowedPaths.some((p: string) => ref.startsWith(p))
            if (!allowed) {
              return { allowed: false, reason: `command accesses path outside workspace: ${ref}` }
            }
          }
        }
      }

      return { allowed: true }
    },
  }
}