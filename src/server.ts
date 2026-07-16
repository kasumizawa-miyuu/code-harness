import express from 'express'
import { loadConfig } from './Config.js'
import { createAgentLoop } from './AgentLoop.js'
import { createLLMProvider } from './LLMProvider.js'
import { createKeyManager } from './KeyManager.js'
import { createLogger } from './Logger.js'

const app = express()
app.use(express.json())
app.use(express.static('public'))

app.post('/api/run', async (req, res) => {
  try {
    const { task } = req.body
    if (!task) {
      return res.status(400).json({ error: 'Missing task description' })
    }

    const config = await loadConfig('harness.config.json')
    const km = createKeyManager()
    const key = await km.getKey()
    if (!key) {
      return res.json({ status: 'no_key', message: 'No API Key configured. Run: harness key update' })
    }
    config.apiKey = key

    const loop = createAgentLoop(config, await createLLMProvider(config))
    const result = await loop.run(task)

    res.json({
      success: result.success,
      status: result.status,
      retries: result.retries,
      output: result.lastResult?.stdout || result.lastResult?.stderr || '',
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/status', async (_req, res) => {
  const km = createKeyManager()
  const hasKey = await km.hasKey()
  res.json({ hasKey, version: '0.1.0' })
})

const PORT = parseInt(process.env.PORT || '3000', 10)

export async function startServer() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`code-harness WebUI running at http://localhost:${PORT}`)
  })
}

// Start directly if run as main
const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')
if (isMain) {
  startServer()
}