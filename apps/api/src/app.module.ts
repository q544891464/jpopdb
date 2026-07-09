import { resolve } from 'node:path'

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { DatabaseService } from './infrastructure/database.service'
import { QueueService } from './infrastructure/queue.service'
import { RedisService } from './infrastructure/redis.service'
import { AdminAuthController } from './modules/admin/admin-auth.controller'
import { AdminAuthGuard } from './modules/admin/admin-auth.guard'
import { HealthController } from './modules/health/health.controller'
import { HealthService } from './modules/health/health.service'
import { ArtistIdentityController } from './modules/artists/artist-identity.controller'
import { ArtistIdentityService } from './modules/artists/artist-identity.service'
import { CatalogController } from './modules/catalog/catalog.controller'
import { CatalogStatsSyncService } from './modules/catalog/catalog-stats-sync.service'
import { CatalogService } from './modules/catalog/catalog.service'
import { NeteaseCatalogDetailService } from './modules/catalog/netease-catalog-detail.service'
import { NeteaseCatalogStatsService } from './modules/catalog/netease-catalog-stats.service'
import { ImportController } from './modules/import/import.controller'
import { ArtistSongImportService } from './modules/import/artist-song-import.service'
import { NeteaseManualImportService } from './modules/import/netease-manual-import.service'
import { PlaylistImportService } from './modules/import/playlist-import.service'
import { SyncJobService } from './modules/import/sync-job.service'
import { ScreeningController } from './modules/screening/screening.controller'
import { ScreeningService } from './modules/screening/screening.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), '.env'),
        resolve(process.cwd(), '..', '..', '.env'),
      ],
    }),
  ],
  controllers: [
    HealthController,
    AdminAuthController,
    ImportController,
    ScreeningController,
    ArtistIdentityController,
    CatalogController,
  ],
  providers: [
    AdminAuthGuard,
    DatabaseService,
    RedisService,
    QueueService,
    HealthService,
    ArtistIdentityService,
    SyncJobService,
    PlaylistImportService,
    ArtistSongImportService,
    NeteaseManualImportService,
    ScreeningService,
    CatalogService,
    CatalogStatsSyncService,
    NeteaseCatalogDetailService,
    NeteaseCatalogStatsService,
  ],
})
export class AppModule {}
