import express from 'express'
import { createAgentLoop } from './AgentLoop.js'
import { createLLMProvider } from './LLMProvider.js'
import { createLogger } from './Logger.js'
import { dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createWorkspaceManager } from './WorkspaceManager.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json())
app.use(express.static(join(__dirname, '..', 'public')))

import { join } from 'node:path'

// Environment detection
const CLOUD_PATHS = ['/app', '/var/task', '/home/site/wwwroot']
const CLOUD_ENV_VARS = ['RENDER', 'RAILWAY', 'FLY_APP_NAME', 'VERCEL', 'CODEX']

function isCloudEnvironment(): boolean {
  for (const envVar of CLOUD_ENV_VARS) {
    if (process.env[envVar]) return true
  }
  const cwd = process.cwd()
  for (const path of CLOUD_PATHS) {
    if (cwd.startsWith(path)) return true
  }
  return false
}

const cloudMode = isCloudEnvironment()
const wsManager = createWorkspaceManager()
let currentSessionId: string | null = null

app.post('/api/run', async (req, res) => {
  try {
    const { task, verbose, apiKey, llmProvider, baseUrl, model, maxRetries } = req.body
    if (!task) {
      return res.status(400).json({ error: 'Missing task description' })
    }

    if (cloudMode && !currentSessionId) {
      return res.json({ status: 'no_workspace', message: '请先上传工作区（zip 文件）后再运行任务' })
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

app.post('/api/workspace/upload', async (req, res) => {
  try {
    const { zipBase64 } = req.body
    if (!zipBase64) {
      return res.status(400).json({ error: 'Missing zipBase64' })
    }

    const buffer = Buffer.from(zipBase64, 'base64')
    const MAX_SIZE = 100 * 1024 * 1024
    if (buffer.length > MAX_SIZE) {
      return res.status(413).json({ error: 'Zip file exceeds 100MB limit' })
    }

    if (currentSessionId) {
      wsManager.cleanup(currentSessionId)
      currentSessionId = null
    }

    const session = wsManager.createSession()
    const files = await wsManager.uploadZip(session.sessionId, buffer)
    const fileTree = wsManager.getFileTree(session.sessionId)
    currentSessionId = session.sessionId

    res.json({
      sessionId: session.sessionId,
      rootDir: session.rootDir,
      files,
      fileTree,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/workspace/status', (_req, res) => {
  const session = currentSessionId ? wsManager.getSession(currentSessionId) : undefined
  res.json({
    hasWorkspace: !!session,
    cloudMode,
    sessionId: session?.sessionId ?? null,
    rootDir: session?.rootDir ?? null,
    fileCount: session ? wsManager.getFileTree(session.sessionId).length : null,
    fileTree: session ? wsManager.getFileTree(session.sessionId) : null,
  })
})

app.get('/api/workspace/download', async (_req, res) => {
  try {
    if (!currentSessionId) {
      return res.status(400).json({ error: 'No active workspace' })
    }
    const buffer = await wsManager.downloadZip(currentSessionId)
    res.set('Content-Type', 'application/zip')
    res.set('Content-Disposition', 'attachment; filename="workspace.zip"')
    res.send(buffer)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
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