import { Context, LLMResponse, ILLMProvider, Config } from './types.js'

export async function createLLMProvider(config: Config): Promise<ILLMProvider> {
  if (config.llmProvider === 'mock') {
    const { createMockLLMProvider } = await import('./MockLLMProvider.js')
    return createMockLLMProvider()
  }

  return {
    async call(context: Context): Promise<LLMResponse> {
      const messages = [
        { role: 'system', content: context.systemPrompt },
        ...context.history.map(e => ({ role: e.role, content: e.content })),
        { role: 'user', content: context.task },
      ]
      if (context.lastFeedback) {
        messages.push({ role: 'user', content: `[Feedback] ${context.lastFeedback.summary}` })
      }

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(config.llmTimeout),
      })

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as any
      return { content: data.choices[0].message.content }
    },
  }
}