import express from 'express'
import { loadConfig } from './Config.js'
import { createAgentLoop } from './AgentLoop.js'
import { createLLMProvider } from './LLMProvider.js'
import { createKeyManager } from './KeyManager.js'
import { writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json())
app.use(express.static(join(__dirname, '..', 'public')))

app.post('/api/run', async (req, res) => {
  try {
    const { task, verbose } = req.body
    if (!task) {
      return res.status(400).json({ error: 'Missing task description' })
    }

    const config = await loadConfig('harness.config.json')
    config.verbose = verbose === true

    const km = createKeyManager()
    const key = await km.getKey()
    if (!key) {
      return res.json({ status: 'no_key', message: 'No API Key configured. Run: harness key update' })
    }
    config.apiKey = key

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

app.get('/api/config', async (_req, res) => {
  const config = await loadConfig('harness.config.json')
  const { apiKey, ...safe } = config as any
  safe.apiKey = ''
  res.json(safe)
})

app.post('/api/config', async (req, res) => {
  try {
    const configPath = join(process.cwd(), 'harness.config.json')
    const existing = await loadConfig(configPath)
    const merged = { ...existing, ...req.body }
    await writeFile(configPath, JSON.stringify(merged, null, 2), 'utf-8')
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/key', async (_req, res) => {
  const km = createKeyManager()
  const hasKey = await km.hasKey()
  res.json({ hasKey })
})

app.post('/api/key', async (req, res) => {
  try {
    const { key } = req.body
    if (!key) return res.status(400).json({ error: 'Missing key' })
    const km = createKeyManager()
    await km.setKey(key)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/key', async (_req, res) => {
  const km = createKeyManager()
  await km.clearKey()
  res.json({ success: true })
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