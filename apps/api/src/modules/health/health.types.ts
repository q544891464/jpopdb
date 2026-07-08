export type DependencyStatus = {
  status: 'up' | 'down'
  latencyMs: number
  error?: string
}

export type HealthResponse = {
  status: 'ok' | 'degraded'
  service: 'jpopdb-api'
  timestamp: string
  uptimeSeconds: number
  dependencies: {
    database: DependencyStatus
    redis: DependencyStatus
  }
}
