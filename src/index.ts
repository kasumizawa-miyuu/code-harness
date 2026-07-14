import { createKeyManager } from './KeyManager.js'
import { loadConfig } from './Config.js'
import { createAgentLoop } from './AgentLoop.js'
import { createLLMProvider } from './LLMProvider.js'
import { createLogger } from './Logger.js'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

async function promptHidden(query: string): Promise<string> {
  const rl = createInterface({ input, output })
  const answer = await rl.question(query)
  rl.close()
  return answer
}

async function prompt(query: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input, output })
  const defaultStr = defaultValue ? ` (${defaultValue})` : ''
  const answer = await rl.question(`${query}${defaultStr}: `)
  rl.close()
  return answer || defaultValue || ''
}

export async function main(args: string[] = process.argv.slice(2)) {
  const [command, ...rest] = args

  if (command === 'configure') {
    const configPath = join(process.cwd(), 'harness.config.json')
    const existing = await loadConfig(configPath)

    const llmProvider = await prompt('LLM provider', existing.llmProvider)
    const baseUrl = await prompt('API base URL', existing.baseUrl)
    const model = await prompt('Model name', existing.model)
    const maxRetries = await prompt('Max retries', String(existing.maxRetries))

    const newConfig = {
      ...existing,
      llmProvider: llmProvider || existing.llmProvider,
      baseUrl: baseUrl || existing.baseUrl,
      model: model || existing.model,
      maxRetries: parseInt(maxRetries) || existing.maxRetries,
    }

    await writeFile(configPath, JSON.stringify(newConfig, null, 2), 'utf-8')
    console.log('Configuration saved to harness.config.json')
    return
  }

  if (command === 'key') {
    const sub = rest[0]
    const km = createKeyManager()

    if (sub === 'status') {
      const has = await km.hasKey()
      console.log(has ? 'API Key: configured' : 'API Key: not configured')
      return
    }

    if (sub === 'update') {
      const key = await promptHidden('Enter API Key: ')
      await km.setKey(key)
      console.log('API Key saved.')
      return
    }

    if (sub === 'clear') {
      await km.clearKey()
      console.log('API Key cleared.')
      return
    }

    console.log('Usage: harness key <status|update|clear>')
    return
  }

  if (command === 'run') {
    const task = rest.join(' ')
    if (!task) {
      console.log('Usage: harness run "<task description>"')
      return
    }

    const config = await loadConfig('harness.config.json')
    const logger = createLogger(config.verbose)

    const km = createKeyManager()
    const key = await km.getKey()
    if (!key) {
      console.log('No API Key configured. Run: harness key update')
      return
    }
    config.apiKey = key

    const loop = createAgentLoop(config, await createLLMProvider(config))
    const result = await loop.run(task)
    console.log(`Status: ${result.status}`)
    console.log(`Retries: ${result.retries}`)
    if (result.lastResult) {
      console.log(`\nResult:\n${result.lastResult.stdout || result.lastResult.stderr}`)
    }
    return
  }

  console.log(`code-harness — Coding Agent Harness

Usage:
  harness configure         Interactive setup
  harness run "<task>"      Run a coding task
  harness key status        Check API key status
  harness key update        Set/update API key
  harness key clear         Remove API key`)
}

const isMain = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('harness')
if (isMain) {
  main().catch(console.error)
}