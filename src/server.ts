import express from 'express'
import { createAgentLoop } from './AgentLoop.js'
import { createLLMProvider } from './LLMProvider.js'
import { createLogger } from './Logger.js'
import { dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json())
app.use(express.static(join(__dirname, '..', 'public')))

import { join } from 'node:path'

app.post('/api/run', async (req, res) => {
  try {
    const { task, verbose, apiKey, llmProvider, baseUrl, model, maxRetries } = req.body
    if (!task) {
      return res.status(400).json({ error: 'Missing task description' })
    }

    const config = {
      llmProvider: llmProvider || 'mock',
      apiKey: apiKey || '',
      baseUrl: baseUrl || 'https://api.openai.com/v1',
      model: model || 'gpt-4o',
      maxRetries: maxRetries || 3,
      workDir: process.cwd(),
      dangerousCommands: ['rm -rf /', 'rm -rf /*', 'rm -rf ~', 'dd if='],
      allowedPaths: [process.cwd()],
      toolTimeout: 30000,
      llmTimeout: 60000,
      memoryFile: '.harness-memory.json',
      verbose: verbose === true,
    }

    if (!config.apiKey) {
      return res.json({ status: 'no_key', message: 'No API Key configured. Enter your API key in the sidebar.' })
    }

    const loop = createAgentLoop(config, await createLLMProvider(config))
    const result = await loop.run(task)

    const exchangeLog = config.verbose
      ? result.exchanges.map(e => `[${e.role}] ${e.content}`).join('\n---\n')
      : ''

    res.json({
      success: result.success,
      status: result.status,
      retries: result.retries,
      output: result.lastResult?.stdout || result.lastResult?.stderr || '',
      exchanges: exchangeLog,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/cwd', (_req, res) => {
  res.json({ cwd: process.cwd(), homedir: homedir() })
})

const PORT = parseInt(process.env.PORT || '3000', 10)

export async function startServer() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`code-harness WebUI running at http://localhost:${PORT}`)
  })
}

const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')
if (isMain) {
  startServer()
}