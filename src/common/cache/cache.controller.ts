import { Controller, Delete, Get, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../decorators/auth.decorator';
import { Role } from '../enums/role.enum';
import { CacheService } from './cache.service';

@ApiTags('performance') @ApiBearerAuth('JWT-auth') @Controller('cache')
export class CacheController {
  constructor(private readonly cache: CacheService) {}

  @Get('stats') @Auth(Role.ADMIN)
  @ApiOperation({ summary: 'Redis cache hits, misses and hit rate since the last reset' })
  stats() { return this.cache.stats(); }

  @Delete() @Auth(Role.ADMIN) @HttpCode(200)
  @ApiOperation({ summary: 'Empty Redis and reset the counters (start a cold-cache test)' })
  async flush() { await this.cache.flush(); return { message: 'Cache cleared' }; }
}
