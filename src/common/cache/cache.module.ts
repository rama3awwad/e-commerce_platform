import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RecentWritesService } from './recent-writes.service';
import { CacheController } from './cache.controller';

@Global()
@Module({ providers: [CacheService, RecentWritesService], controllers: [CacheController], exports: [CacheService, RecentWritesService] })
export class CacheModule {}
