import { createAgentLoop } from '../../src/AgentLoop.js'

async function main() {
  console.log('=== Demo: Adaptive Retry — Repeated Error Detection ===\n')

  const loop = createAgentLoop({
    llmProvider: 'mock',
    apiKey: '',
    model: 'gpt-4o',
    maxRetries: 5,
    workDir: process.cwd(),
    dangerousCommands: ['rm -rf /'],
    allowedPaths: [process.cwd()],
    toolTimeout: 5000,
    llmTimeout: 10000,
    memoryFile: '.harness-demo-memory.json',
    verbose: true,
  })

  // Same error repeated
  loop.setMockResponses([
    'run_command command="exit 1"',
    'run_command command="exit 1"',
  ])

  console.log('Running task that produces repeated errors...')
  const result = await loop.run('fix the bug')
  console.log(`\nResult: success=${result.success}, status=${result.status}`)
  console.log(`Retries used: ${result.retries} (max was 5, stopped early due to repeated error detection)`)

  console.log('\n=== Demo Complete ===')
}

main().catch(console.error)