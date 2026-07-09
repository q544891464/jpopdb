import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common'

import { AdminAuthGuard } from '../admin/admin-auth.guard'
import {
  ArtistSongImportService,
  type ConfirmedArtistImportResponse,
} from './artist-song-import.service'
import { PlaylistImportService } from './playlist-import.service'
import type { SyncJobResponse } from './sync-job.types'
import { SyncJobService } from './sync-job.service'
import {
  NeteaseManualImportService,
  type ManualSongImportResponse,
  type NeteaseArtistSearchItem,
  type NeteaseSongSearchItem,
} from './netease-manual-import.service'

@Controller('api/admin')
@UseGuards(AdminAuthGuard)
export class ImportController {
  constructor(
    @Inject(PlaylistImportService) private readonly playlistImports: PlaylistImportService,
    @Inject(ArtistSongImportService) private readonly artistSongImports: ArtistSongImportService,
    @Inject(NeteaseManualImportService) private readonly neteaseManualImports: NeteaseManualImportService,
    @Inject(SyncJobService) private readonly syncJobs: SyncJobService,
  ) {}

  @Post('import/playlist')
  async importPlaylist(@Body() body: unknown): Promise<SyncJobResponse> {
    return this.playlistImports.create(body)
  }

  @Post('import/artist/manual')
  async importManualArtist(@Body() body: unknown): Promise<SyncJobResponse> {
    return this.artistSongImports.createManualArtistImport(body)
  }

  @Get('import/search/songs')
  async searchSongs(
    @Query() query: unknown,
  ): Promise<{ items: NeteaseSongSearchItem[] }> {
    return this.neteaseManualImports.searchSongs(query)
  }

  @Get('import/search/artists')
  async searchArtists(
    @Query() query: unknown,
  ): Promise<{ items: NeteaseArtistSearchItem[] }> {
    return this.neteaseManualImports.searchArtists(query)
  }

  @Post('import/song/manual')
  async importManualSong(@Body() body: unknown): Promise<ManualSongImportResponse> {
    return this.neteaseManualImports.importSong(body)
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

  @Post('import/artists/truncated/continue')
  async continueTruncatedArtistSongs(
    @Body() body: unknown,
  ): Promise<ConfirmedArtistImportResponse> {
    return this.artistSongImports.continueTruncatedImports(body)
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
