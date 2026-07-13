import { createGuardrail } from '../../src/Guardrail.js'
import { createAction } from '../../src/types.js'

async function main() {
  console.log('=== Demo: Guardrail Intercepting Dangerous Action ===\n')

  const guardrail = createGuardrail({
    dangerousCommands: ['rm -rf /', 'rm -rf /*'],
    allowedPaths: ['/safe/project'],
  })

  const dangerousAction = createAction('run_command', { command: 'rm -rf /' })
  console.log(`Action: ${dangerousAction.type} command="${dangerousAction.params.command}"`)
  const result = await guardrail.check(dangerousAction)
  console.log(`Guardrail result: allowed=${result.allowed}`)
  if (!result.allowed) {
    console.log(`Reason: ${(result as any).reason}`)
  }

  const safeAction = createAction('run_command', { command: 'npm test' })
  console.log(`\nAction: ${safeAction.type} command="${safeAction.params.command}"`)
  const safeResult = await guardrail.check(safeAction)
  console.log(`Guardrail result: allowed=${safeResult.allowed}`)

  console.log('\n=== Demo Complete ===')
}

main().catch(console.error)