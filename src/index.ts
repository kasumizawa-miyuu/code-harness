import { createKeyManager } from './KeyManager.js'
import { loadConfig } from './Config.js'
import { createAgentLoop } from './AgentLoop.js'
import { createLogger } from './Logger.js'
import { createReadlineInterface, question } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

async function promptHidden(query: string): Promise<string> {
  const rl = createReadlineInterface({ input, output })
  const answer = await question(rl, query)
  rl.close()
  return answer
}

export async function main(args: string[] = process.argv.slice(2)) {
  const [command, ...rest] = args

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

    const loop = createAgentLoop(config)
    const result = await loop.run(task)
    console.log(`Status: ${result.status}`)
    console.log(`Retries: ${result.retries}`)
    return
  }

  console.log(`code-harness — Coding Agent Harness

Usage:
  harness run "<task>"     Run a coding task
  harness key status       Check API key status
  harness key update       Set/update API key
  harness key clear        Remove API key
  harness configure        Interactive setup`)
}

const isMain = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')
if (isMain) {
  main().catch(console.error)
}