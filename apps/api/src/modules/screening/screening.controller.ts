import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common'

import { AdminAuthGuard } from '../admin/admin-auth.guard'
import type { SyncJobResponse } from '../import/sync-job.types'
import { ScreeningService } from './screening.service'
import type {
  CandidateFilter,
  CandidateListResponse,
  CandidateSongResponse,
  ScreeningStatsResponse,
  ScreeningStatus,
} from './screening.types'

@Controller('api/admin/screening')
@UseGuards(AdminAuthGuard)
export class ScreeningController {
  constructor(@Inject(ScreeningService) private readonly screening: ScreeningService) {}

  @Post('jobs')
  async createScreeningJob(@Body() body: unknown): Promise<SyncJobResponse> {
    return this.screening.createScreeningJob(body)
  }

  @Get('candidates')
  async getCandidates(
    @Query('status') status?: ScreeningStatus,
    @Query('limit') limit?: string,
    @Query('filter') filter?: CandidateFilter,
  ): Promise<CandidateListResponse> {
    return this.screening.findCandidates(status ?? 'pending', limit ? Number(limit) : 50, filter ?? 'all')
  }

  @Get('stats')
  async getStats(): Promise<ScreeningStatsResponse> {
    return this.screening.getStats()
  }

  @Post('songs/:songId/review')
  async reviewSong(
    @Param('songId') songId: string,
    @Body() body: unknown,
  ): Promise<CandidateSongResponse> {
    return this.screening.reviewSong(songId, body)
  }

  @Post('songs/:songId/rescreen')
  async rescreenSong(@Param('songId') songId: string): Promise<SyncJobResponse> {
    return this.screening.createSongRescreenJob(songId)
  }
}
