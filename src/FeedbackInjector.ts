import { VerificationResult, Context, IFeedbackInjector } from './types.js'

export function createFeedbackInjector(): IFeedbackInjector {
  return {
    inject(feedback: VerificationResult, context: Context): Context {
      return {
        ...context,
        lastFeedback: feedback,
        retryCount: context.retryCount + 1,
        history: [
          ...context.history,
          { role: 'system', content: `[Feedback] ${feedback.summary}`, timestamp: Date.now() },
        ],
      }
    },
  }
}