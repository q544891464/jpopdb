import { Controller, Get, Inject, Param, Query } from '@nestjs/common'

import { CatalogService } from './catalog.service'
import type {
  CatalogAlbumPage,
  CatalogArtistDetail,
  CatalogArtistListResponse,
  CatalogSongDetail,
  CatalogSongListResponse,
} from './catalog.types'

@Controller('api/catalog')
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get('songs')
  async getSongs(@Query() query: unknown): Promise<CatalogSongListResponse> {
    return this.catalog.findSongs(query)
  }

  @Get('songs/:songId')
  async getSong(@Param('songId') songId: string): Promise<CatalogSongDetail> {
    return this.catalog.findSong(songId)
  }

  @Get('artists')
  async getArtists(@Query() query: unknown): Promise<CatalogArtistListResponse> {
    return this.catalog.findArtists(query)
  }

  @Get('artists/:artistId')
  async getArtist(
    @Param('artistId') artistId: string,
    @Query() query: unknown,
  ): Promise<CatalogArtistDetail> {
    return this.catalog.findArtist(artistId, query)
  }

  @Get('albums/:albumId')
  async getAlbum(
    @Param('albumId') albumId: string,
    @Query() query: unknown,
  ): Promise<CatalogAlbumPage> {
    return this.catalog.findAlbum(albumId, query)
  }
}
