import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common'

import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { ArtistIdentityService } from './artist-identity.service'
import type {
  ArtistIdentityListResponse,
  ArtistIdentityResponse,
  ArtistIdentityStatus,
} from './artist-identity.types'

@Controller('api/admin/artists')
@UseGuards(AdminAuthGuard)
export class ArtistIdentityController {
  constructor(@Inject(ArtistIdentityService) private readonly identities: ArtistIdentityService) {}

  @Get('identity')
  async getIdentities(
    @Query('status') status?: ArtistIdentityStatus,
    @Query('limit') limit?: string,
  ): Promise<ArtistIdentityListResponse> {
    return this.identities.findIdentities(status, limit ? Number(limit) : 50)
  }

  @Post(':artistId/identity/review')
  async reviewIdentity(
    @Param('artistId') artistId: string,
    @Body() body: unknown,
  ): Promise<ArtistIdentityResponse> {
    return this.identities.reviewIdentity(artistId, body)
  }
}
