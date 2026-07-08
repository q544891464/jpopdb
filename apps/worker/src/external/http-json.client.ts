import { ExternalApiError } from './external-api-error'

export type JsonClientOptions = {
  source: string
  baseUrl: string
  timeoutMs?: number
  retries?: number
  headers?: Record<string, string>
  minDelayMs?: number
}

export class HttpJsonClient {
  private readonly timeoutMs: number
  private readonly retries: number
  private readonly headers: Record<string, string>
  private lastRequestAt = 0

  constructor(private readonly options: JsonClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.retries = options.retries ?? 2
    this.headers = options.headers ?? {}
  }

  async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(path, this.options.baseUrl)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }

    let lastError: unknown
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      await this.waitForRateLimit()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const response = await fetch(url, {
          headers: this.headers,
          signal: controller.signal,
        })
        if (response.status === 429) {
          throw new ExternalApiError('External API rate limited', this.options.source, 'rate_limited', response.status)
        }
        if (response.status === 404) {
          throw new ExternalApiError('External API resource not found', this.options.source, 'not_found', response.status)
        }
        if (!response.ok) {
          const category = response.status >= 500 ? 'network_error' : 'unknown_error'
          throw new ExternalApiError(
            `External API returned HTTP ${response.status}`,
            this.options.source,
            category,
            response.status,
          )
        }
        return (await response.json()) as T
      } catch (error) {
        lastError = this.normalizeError(error)
        if (!this.shouldRetry(lastError, attempt)) {
          throw lastError
        }
        await sleep(500 * (attempt + 1))
      } finally {
        clearTimeout(timeout)
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ExternalApiError('External API request failed', this.options.source, 'unknown_error')
  }

  private async waitForRateLimit(): Promise<void> {
    const minDelayMs = this.options.minDelayMs ?? 0
    if (minDelayMs <= 0) {
      return
    }
    const elapsed = Date.now() - this.lastRequestAt
    if (elapsed < minDelayMs) {
      await sleep(minDelayMs - elapsed)
    }
    this.lastRequestAt = Date.now()
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof ExternalApiError) {
      return error
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      return new ExternalApiError('External API request timed out', this.options.source, 'timeout')
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return new ExternalApiError('External API request timed out', this.options.source, 'timeout')
    }
    return new ExternalApiError(
      error instanceof Error ? error.message : 'External API network error',
      this.options.source,
      'network_error',
    )
  }

  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= this.retries) {
      return false
    }
    if (!(error instanceof ExternalApiError)) {
      return false
    }
    return ['network_error', 'timeout', 'rate_limited'].includes(error.category)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
