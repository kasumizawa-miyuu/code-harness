import { AgentLoopResult, Context, Action, VerificationResult, Config } from './types.js'
import { createActionParser } from './ActionParser.js'
import { createToolExecutor } from './ToolExecutor.js'
import { createGuardrail } from './Guardrail.js'
import { createVerifier } from './Verifier.js'
import { createFeedbackInjector } from './FeedbackInjector.js'
import { createLogger } from './Logger.js'
import { createMockLLMProvider } from './MockLLMProvider.js'

const SYSTEM_PROMPT = `You are a coding assistant. You can perform actions by outputting one of:
- read_file path="<filepath>"
- write_file path="<filepath>" content="<content>"
- patch_file path="<filepath>" content="<content>"
- run_command command="<command>"
- run_test test="<test command>"

Output ONE action per response. After receiving feedback, adjust your approach.`

function summariesEqual(a: string, b: string): boolean {
  return a.trim() === b.trim()
}

export function createAgentLoop(config: Config) {
  const logger = createLogger(config.verbose)
  const parser = createActionParser()
  const executor = createToolExecutor(config)
  const guardrail = createGuardrail(config)
  const verifier = createVerifier()
  const injector = createFeedbackInjector()

  const llmProvider = createMockLLMProvider()

  return {
    setMockResponses(responses: string[]) {
      llmProvider.setResponses(responses)
    },

    async run(task: string): Promise<AgentLoopResult> {
      let context: Context = {
        systemPrompt: SYSTEM_PROMPT,
        task,
        history: [],
        lastFeedback: null,
        retryCount: 0,
      }

      let lastSummary: string | null = null
      let sameCategoryCount = 0
      let lastCategory: string | null = null

      while (true) {
        logger.info('Thinking...')

        let response
        try {
          response = await llmProvider.call(context)
        } catch (err: any) {
          logger.error(`LLM error: ${err.message}`)
          return { success: false, retries: context.retryCount, status: 'llm_error', exchanges: context.history }
        }

        if (!response.content) {
          logger.info('No response from LLM, stopping')
          break
        }

        context.history.push({ role: 'assistant', content: response.content, timestamp: Date.now() })

        const action = parser.parse(response.content)
        if (!action) {
          logger.warn('Failed to parse action')
          const feedback = injector.inject(
            { passed: false, category: 'test_fail', severity: 'error', details: response.content, summary: 'Failed to parse your action. Output one action per response.' },
            context,
          )
          context = feedback
          if (context.retryCount >= config.maxRetries) {
            return { success: false, retries: context.retryCount, status: 'parse_error', exchanges: context.history }
          }
          continue
        }

        logger.info(`Action: ${action.type} ${JSON.stringify(action.params)}`)

        const guardResult = await guardrail.check(action)
        if (!guardResult.allowed) {
          logger.warn(`Guardrail blocked: ${(guardResult as any).reason}`)
          const feedback = injector.inject(
            { passed: false, category: 'test_fail', severity: 'error', details: (guardResult as any).reason, summary: `Action blocked: ${(guardResult as any).reason}` },
            context,
          )
          context = feedback
          continue
        }

        const actionResult = await executor.execute(action)
        logger.info(`Result: exitCode=${actionResult.exitCode}`)

        const verification = await verifier.verify(actionResult)
        logger.info(`Verification: ${verification.category} passed=${verification.passed}`)

        if (!verification.passed) {
          if (lastSummary !== null && summariesEqual(verification.summary, lastSummary)) {
            return { success: false, retries: context.retryCount, status: 'repeated_error', exchanges: context.history }
          }

          if (lastCategory === verification.category) {
            sameCategoryCount++
          } else {
            sameCategoryCount = 1
          }
          lastCategory = verification.category

          if (sameCategoryCount >= 3) {
            return { success: false, retries: context.retryCount, status: 'direction_error', exchanges: context.history }
          }

          lastSummary = verification.summary

          if (verification.severity === 'fatal' && context.retryCount >= config.maxRetries) {
            return { success: false, retries: context.retryCount, status: 'failed_after_retries', exchanges: context.history }
          }

          context = injector.inject(verification, context)
          logger.info(`Retry ${context.retryCount}/${config.maxRetries}`)
          continue
        }

        logger.info('Task completed successfully')
        return { success: true, retries: context.retryCount, status: 'completed', exchanges: context.history }
      }

      return { success: true, retries: context.retryCount, status: 'completed', exchanges: context.history }
    },
  }
}