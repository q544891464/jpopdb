export const syncJobStatuses = [
  'pending',
  'running',
  'success',
  'failed',
  'partial_success',
] as const

export type SyncJobStatus = (typeof syncJobStatuses)[number]

export type SyncJobResponse = {
  id: string
  jobType: string
  sourceId: string | null
  status: SyncJobStatus
  totalCount: number
  successCount: number
  failedCount: number
  errorMessage: string | null
  metadata: Record<string, unknown>
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}
