import { Context, LLMResponse, ILLMProvider } from './types.js'

export function createMockLLMProvider(initialResponses: string[] = []): ILLMProvider & { setResponses(r: string[]): void } {
  let responses = [...initialResponses]
  let index = 0

  return {
    async call(_context: Context): Promise<LLMResponse> {
      if (index >= responses.length) return { content: '' }
      return { content: responses[index++] }
    },
    setResponses(r: string[]) {
      responses = [...r]
      index = 0
    },
  }
}