import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

export class RedisThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    this.redis.on('error', (error) => this.logger.warn(`Redis throttler error: ${error.message}`));
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, _throttlerName: string): Promise<ThrottlerStorageRecord> {
    const script = `
      local blockedTtl = redis.call('PTTL', KEYS[2])
      if blockedTtl > 0 then
        return { redis.call('GET', KEYS[1]) or '0', redis.call('PTTL', KEYS[1]), 1, blockedTtl }
      end
      local hits = redis.call('INCR', KEYS[1])
      local hitTtl = redis.call('PTTL', KEYS[1])
      if hits == 1 or hitTtl < 0 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
        hitTtl = tonumber(ARGV[1])
      end
      if hits > tonumber(ARGV[2]) then
        if tonumber(ARGV[3]) > 0 then
          redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
          return { hits, hitTtl, 1, tonumber(ARGV[3]) }
        end
        return { hits, hitTtl, 1, hitTtl }
      end
      return { hits, hitTtl, 0, 0 }
    `;
    try {
      const [totalHits, ttlMs, blocked, blockMs] = (await this.redis.eval(script, 2, key, `${key}:blocked`, ttl, limit, blockDuration)) as number[];
      return { totalHits: Number(totalHits), timeToExpire: Math.ceil(Number(ttlMs) / 1000), isBlocked: Number(blocked) === 1, timeToBlockExpire: Math.ceil(Number(blockMs) / 1000) };
    } catch (error) {
      this.logger.warn(`Redis throttler increment failed: ${(error as Error).message}`);
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }

  async onApplicationShutdown() { this.redis.disconnect(); }
}
