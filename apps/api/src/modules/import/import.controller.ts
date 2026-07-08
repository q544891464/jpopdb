import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common'

import { AdminAuthGuard } from '../admin/admin-auth.guard'
import {
  ArtistSongImportService,
  type ConfirmedArtistImportResponse,
} from './artist-song-import.service'
import { PlaylistImportService } from './playlist-import.service'
import type { SyncJobResponse } from './sync-job.types'
import { SyncJobService } from './sync-job.service'

@Controller('api/admin')
@UseGuards(AdminAuthGuard)
export class ImportController {
  constructor(
    @Inject(PlaylistImportService) private readonly playlistImports: PlaylistImportService,
    @Inject(ArtistSongImportService) private readonly artistSongImports: ArtistSongImportService,
    @Inject(SyncJobService) private readonly syncJobs: SyncJobService,
  ) {}

  @Post('import/playlist')
  async importPlaylist(@Body() body: unknown): Promise<SyncJobResponse> {
    return this.playlistImports.create(body)
  }

  @Post('import/artist/:artistId')
  async importArtistSongs(
    @Param('artistId') artistId: string,
    @Body() body: unknown,
  ): Promise<SyncJobResponse> {
    return this.artistSongImports.createForArtist(artistId, body)
  }

  @Post('import/artist/:artistId/continue')
  async continueArtistSongs(
    @Param('artistId') artistId: string,
    @Body() body: unknown,
  ): Promise<SyncJobResponse> {
    return this.artistSongImports.continueForArtist(artistId, body)
  }

  @Post('import/artists/confirmed')
  async importConfirmedArtistSongs(
    @Body() body: unknown,
  ): Promise<ConfirmedArtistImportResponse> {
    return this.artistSongImports.createForConfirmedArtists(body)
  }

  @Get('jobs')
  async getJobs(): Promise<SyncJobResponse[]> {
    return this.syncJobs.findRecent()
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string): Promise<SyncJobResponse> {
    return this.syncJobs.findById(id)
  }
}
