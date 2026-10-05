export class ServiceError extends Error {
  constructor(public code: string, message: string, public status = 502, public retryAfter?: number) {
    super(message)
    this.name = 'ServiceError'
  }
}

export function errorResponse(error: unknown): { status: number; body: { error: string; code: string }; retryAfter?: number } {
  if (error instanceof ServiceError) return { status: error.status, body: { error: error.message, code: error.code }, retryAfter: error.retryAfter }
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return { status: 504, body: { error: 'Generation timed out. Please try again.', code: 'TIMEOUT' } }
  return { status: 500, body: { error: 'Generation failed. Please try again later.', code: 'INTERNAL_ERROR' } }
}
