import type { ExternalErrorCategory } from './external.types'

export class ExternalApiError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly category: ExternalErrorCategory,
    readonly status?: number,
  ) {
    super(message)
  }
}

export function isRecoverableExternalError(error: unknown): boolean {
  if (!(error instanceof ExternalApiError)) {
    return false
  }
  return ['network_error', 'timeout', 'rate_limited'].includes(error.category)
}
