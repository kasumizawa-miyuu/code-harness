import { Action, ActionResult, IToolExecutor } from './types.js'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { exec } from 'node:child_process'
import { dirname, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

function isPathAllowed(rawPath: string, allowedPaths: string[]): boolean {
  if (!allowedPaths || allowedPaths.length === 0) return true
  const normalized = resolve(rawPath)
  return allowedPaths.some(p => {
    const normalizedPrefix = resolve(p)
    if (normalized === normalizedPrefix) return true
    return normalized.startsWith(normalizedPrefix + sep)
  })
}

function extractPathsFromCommand(cmd: string): string[] {
  const paths: string[] = []
  const pattern = /\/(?:[^\s"'`|&;()<>]+[/])?[^\s"'`|&;()<>]+/g
  let match
  while ((match = pattern.exec(cmd)) !== null) {
    const p = match[0]
    if (p && !p.startsWith('/usr/') && !p.startsWith('/bin/') && !p.startsWith('/lib/') &&
        !p.startsWith('/dev/') && !p.startsWith('/proc/') && !p.startsWith('/sys/') && p !== '/') {
      paths.push(p)
    }
  }
  return paths
}

export function createToolExecutor(config: { toolTimeout: number; workDir?: string; allowedPaths?: string[] }): IToolExecutor {
  const allowedPaths: string[] = config.allowedPaths || []
  const workDir: string | undefined = config.workDir

  return {
    async execute(action: Action): Promise<ActionResult> {
      const start = Date.now()
      try {
        switch (action.type) {
          case 'read_file': {
            const path = action.params.path || ''
            if (!isPathAllowed(path, allowedPaths)) {
              return { success: false, stdout: '', stderr: `Path outside workspace: ${path}`, exitCode: 1, duration: Date.now() - start }
            }
            const content = await readFile(path, 'utf-8')
            return { success: true, stdout: content, stderr: '', exitCode: 0, duration: Date.now() - start }
          }
          case 'write_file': {
            const path = action.params.path || ''
            if (!isPathAllowed(path, allowedPaths)) {
              return { success: false, stdout: '', stderr: `Path outside workspace: ${path}`, exitCode: 1, duration: Date.now() - start }
            }
            await mkdir(dirname(path), { recursive: true })
            await writeFile(path, action.params.content, 'utf-8')
            return { success: true, stdout: 'File written', stderr: '', exitCode: 0, duration: Date.now() - start }
          }
          case 'patch_file': {
            const path = action.params.path || ''
            if (!isPathAllowed(path, allowedPaths)) {
              return { success: false, stdout: '', stderr: `Path outside workspace: ${path}`, exitCode: 1, duration: Date.now() - start }
            }
            await mkdir(dirname(path), { recursive: true })
            await writeFile(path, action.params.content, 'utf-8')
            return { success: true, stdout: 'File patched', stderr: '', exitCode: 0, duration: Date.now() - start }
          }
          case 'run_command':
          case 'run_test': {
            const cmd = action.type === 'run_command' ? action.params.command : action.params.test
            if (allowedPaths.length > 0) {
              const cmdPaths = extractPathsFromCommand(cmd)
              for (const p of cmdPaths) {
                if (!isPathAllowed(p, allowedPaths)) {
                  return { success: false, stdout: '', stderr: `Path outside workspace: ${p}`, exitCode: 1, duration: Date.now() - start }
                }
              }
            }
            const { stdout, stderr } = await execAsync(cmd, {
              timeout: config.toolTimeout,
              ...(workDir ? { cwd: workDir } : {}),
            })
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