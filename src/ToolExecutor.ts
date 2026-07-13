import { Action, ActionResult, IToolExecutor } from './types.js'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { exec } from 'node:child_process'
import { dirname } from 'node:path'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export function createToolExecutor(config: { toolTimeout: number }): IToolExecutor {
  return {
    async execute(action: Action): Promise<ActionResult> {
      const start = Date.now()
      try {
        switch (action.type) {
          case 'read_file': {
            const content = await readFile(action.params.path, 'utf-8')
            return { success: true, stdout: content, stderr: '', exitCode: 0, duration: Date.now() - start }
          }
          case 'write_file': {
            await mkdir(dirname(action.params.path), { recursive: true })
            await writeFile(action.params.path, action.params.content, 'utf-8')
            return { success: true, stdout: 'File written', stderr: '', exitCode: 0, duration: Date.now() - start }
          }
          case 'patch_file': {
            await mkdir(dirname(action.params.path), { recursive: true })
            await writeFile(action.params.path, action.params.content, 'utf-8')
            return { success: true, stdout: 'File patched', stderr: '', exitCode: 0, duration: Date.now() - start }
          }
          case 'run_command':
          case 'run_test': {
            const cmd = action.type === 'run_command' ? action.params.command : action.params.test
            const { stdout, stderr } = await execAsync(cmd, { timeout: config.toolTimeout })
            return { success: true, stdout, stderr, exitCode: 0, duration: Date.now() - start }
          }
        }
      } catch (err: any) {
        return {
          success: false,
          stdout: '',
          stderr: err.message || String(err),
          exitCode: typeof err.code === 'number' ? err.code : 1,
          duration: Date.now() - start,
        }
      }
    },
  }
}