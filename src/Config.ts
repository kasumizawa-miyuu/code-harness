import { readFile } from 'node:fs/promises'
import { Config } from './types.js'

const DEFAULT_CONFIG: Config = {
  llmProvider: 'mock',
  apiKey: '',
  model: 'gpt-4o',
  maxRetries: 3,
  workDir: process.cwd(),
  dangerousCommands: ['rm -rf /', 'rm -rf /*', 'rm -rf ~', 'dd if='],
  allowedPaths: [process.cwd()],
  toolTimeout: 30000,
  llmTimeout: 60000,
  memoryFile: '.harness-memory.json',
  verbose: false,
}

const ENV_MAP: Record<string, keyof Config> = {
  HARNESS_LLM_PROVIDER: 'llmProvider',
  HARNESS_API_KEY: 'apiKey',
  HARNESS_MODEL: 'model',
  HARNESS_MAX_RETRIES: 'maxRetries',
  HARNESS_WORK_DIR: 'workDir',
  HARNESS_TOOL_TIMEOUT: 'toolTimeout',
  HARNESS_LLM_TIMEOUT: 'llmTimeout',
  HARNESS_VERBOSE: 'verbose',
}

export async function loadConfig(path?: string): Promise<Config> {
  const config = { ...DEFAULT_CONFIG }

  if (path) {
    try {
      const raw = await readFile(path, 'utf-8')
      const parsed = JSON.parse(raw)
      Object.assign(config, parsed)
    } catch {
      // file not found or invalid JSON — use defaults
    }
  }

  for (const [envKey, configKey] of Object.entries(ENV_MAP)) {
    const envVal = process.env[envKey]
    if (envVal !== undefined) {
      if (configKey === 'maxRetries' || configKey === 'toolTimeout' || configKey === 'llmTimeout') {
        (config as any)[configKey] = parseInt(envVal, 10)
      } else if (configKey === 'verbose') {
        (config as any)[configKey] = envVal === 'true' || envVal === '1'
      } else {
        (config as any)[configKey] = envVal
      }
    }
  }

  return config
}