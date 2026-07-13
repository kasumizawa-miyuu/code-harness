import { createAgentLoop } from '../../src/AgentLoop.js'

async function main() {
  console.log('=== Demo: Feedback Loop Correction ===\n')

  const loop = createAgentLoop({
    llmProvider: 'mock',
    apiKey: '',
    model: 'gpt-4o',
    maxRetries: 3,
    workDir: process.cwd(),
    dangerousCommands: ['rm -rf /'],
    allowedPaths: [process.cwd()],
    toolTimeout: 5000,
    llmTimeout: 10000,
    memoryFile: '.harness-demo-memory.json',
    verbose: true,
  })

  // First response fails, second response succeeds
  loop.setMockResponses([
    'run_command command="exit 1"',
    'run_command command="echo fixed"',
  ])

  console.log('Running task with feedback loop...')
  const result = await loop.run('fix the issue')
  console.log(`\nResult: success=${result.success}, status=${result.status}, retries=${result.retries}`)

  console.log('\n=== Demo Complete ===')
}

main().catch(console.error)