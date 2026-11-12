import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { setResponseHeader } from '../perf/response-headers';

/**
 * المتطلب الثالث — التخزين المؤقت في Redis.
 *
 * ماذا نخزّن؟  بيانات المنتجات والتصنيفات (تُقرأ كثيراً وتتغير نادراً، ومتشابهة لكل المستخدمين).
 * ماذا لا نخزّن؟
 *   - المخزون (stock): يتغير مع كل طلب، والقيمة القديمة قد تبيع قطعة غير موجودة → يُقرأ دائماً من خدمة المخزون.
 *   - الطلبات: خاصة بكل مستخدم وتتغير حالتها، والخطأ فيها يكشف بيانات أو يعرض حالة خاطئة.
 *   - بيانات الدخول والتوكنات وكلمات المرور: حساسة أمنياً.
 * متى تنتهي الصلاحية؟  لكل مفتاح TTL (CACHE_TTL_SECONDS، افتراضياً 60 ثانية) كشبكة أمان.
 * متى نحذفه؟  عند أي تعديل على منتج/تصنيف نرفع رقم النسخة products:version،
 *   فتصبح كل المفاتيح القديمة غير مستخدمة فوراً (وتُحذف وحدها عند انتهاء TTL).
 *
 * حماية من cache stampede (مثال Black Friday): لما ينتهي TTL مفتاح عليه ضغط، أول طلب فقط
 * يأخذ قفلاً (SET lock NX PX) ويذهب للقاعدة، والباقي ينتظرون أن يملأ الكاش بدل أن يضربوا القاعدة معاً.
 * القفل له مدة صلاحية (CACHE_LOCK_TTL_MS) حتى لو مات صاحبه لا يبقى مقفولاً للأبد،
 * والمنتظر إذا لم يجد النتيجة خلال CACHE_LOCK_WAIT_MS يتعافى (recovery) ويقرأ من القاعدة بنفسه.
 *
 * إذا توقف Redis لا يتوقف التطبيق: نقرأ من قاعدة البيانات مباشرة.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  readonly enabled = process.env.CACHE_ENABLED !== 'false';
  readonly ttlSeconds = Number(process.env.CACHE_TTL_SECONDS || 60);
  private readonly lockTtlMs = Number(process.env.CACHE_LOCK_TTL_MS || 5000);
  private readonly lockWaitMs = Number(process.env.CACHE_LOCK_WAIT_MS || 3000);
  readonly redis?: Redis;
  private hits = 0;
  private misses = 0;
  private dbLoads = 0;
  private stampedeWaits = 0;
  private lockTimeouts = 0;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL is not set: cache and shared read-your-writes markers are disabled');
      return;
    }
    this.redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
    this.redis.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
    this.redis.on('ready', () => this.logger.log(`Redis connected (cache ${this.enabled ? 'ON' : 'OFF'}, TTL=${this.ttlSeconds}s)`));
  }

  /**
   * يرجع القيمة من Redis إن وجدت (HIT)، وإلا يحمّلها من القاعدة ويخزنها مع TTL (MISS).
   * عند MISS: طلب واحد فقط يحمّل من القاعدة (القفل)، والباقي ينتظر (WAIT-HIT)،
   * وإذا طال الانتظار يقرأ من القاعدة بنفسه (TIMEOUT).
   */
  async getOrLoad<T>(key: string, load: () => Promise<T>, ttlSeconds = this.ttlSeconds): Promise<T> {
    if (!this.enabled || !this.redis) {
      setResponseHeader('X-Cache', 'OFF');
      return load();
    }
    const redis = this.redis;
    try {
      const cached = await redis.get(key);
      if (cached !== null) {
        this.hits++;
        setResponseHeader('X-Cache', 'HIT');
        return JSON.parse(cached) as T;
      }
    } catch (err) {
      this.logger.warn(`Cache read failed for ${key}, falling back to DB: ${(err as Error).message}`);
      return this.loadFromDb(load);
    }
    this.misses++;

    const lockKey = `lock:${key}`;
    const token = randomUUID();
    let locked = false;
    try { locked = (await redis.set(lockKey, token, 'PX', this.lockTtlMs, 'NX')) === 'OK'; }
    catch { return this.loadFromDb(load); }

    if (!locked) {
      // طلب آخر يحمّل نفس المفتاح الآن → ننتظره بدل ضرب القاعدة.
      this.stampedeWaits++;
      const deadline = Date.now() + this.lockWaitMs;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        try {
          const cached = await redis.get(key);
          if (cached !== null) {
            setResponseHeader('X-Cache', 'WAIT-HIT');
            return JSON.parse(cached) as T;
          }
        } catch { break; }
      }
      // Recovery: صاحب القفل بطيء أو وقع → لا نترك المستخدم ينتظر للأبد.
      this.lockTimeouts++;
      setResponseHeader('X-Cache', 'TIMEOUT');
      return this.loadFromDb(load);
    }

    try {
      setResponseHeader('X-Cache', 'MISS');
      const value = await this.loadFromDb(load);
      try { await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds); }
      catch (err) { this.logger.warn(`Cache write failed for ${key}: ${(err as Error).message}`); }
      return value;
    } finally {
      // نحرر القفل فقط إذا كان ما زال لنا (لم تنتهِ صلاحيته ويأخذه غيرنا).
      redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0", 1, lockKey, token)
        .catch(() => undefined);
    }
  }

  private loadFromDb<T>(load: () => Promise<T>): Promise<T> {
    this.dbLoads++;
    return load();
  }

  /** رقم نسخة مجموعة مفاتيح (مثل products). يدخل في اسم كل مفتاح. */
  async version(namespace: string): Promise<string> {
    if (!this.enabled || !this.redis) return '0';
    try { return (await this.redis.get(`${namespace}:version`)) ?? '0'; } catch { return '0'; }
  }

  /** إبطال كل مفاتيح المجموعة دفعة واحدة برفع رقم النسخة. */
  async invalidate(namespace: string): Promise<void> {
    if (!this.redis) return;
    try {
      const v = await this.redis.incr(`${namespace}:version`);
      this.logger.log(`Cache invalidated: ${namespace} -> version ${v}`);
    } catch (err) {
      this.logger.warn(`Cache invalidation failed for ${namespace}: ${(err as Error).message}`);
    }
  }

  async stats() {
    const total = this.hits + this.misses;
    let keys: number | null = null;
    try { keys = this.redis ? await this.redis.dbsize() : null; } catch { keys = null; }
    return {
      enabled: this.enabled,
      connected: this.redis?.status === 'ready',
      ttlSeconds: this.ttlSeconds,
      hits: this.hits,
      misses: this.misses,
      hitRate: total ? `${((this.hits / total) * 100).toFixed(1)}%` : '0%',
      // كم مرة ذهبنا فعلاً للقاعدة، وكم طلب انتظر القفل بدل ما يضرب القاعدة (stampede)
      dbLoads: this.dbLoads,
      stampedeWaits: this.stampedeWaits,
      lockTimeouts: this.lockTimeouts,
      keysInRedis: keys,
    };
  }

  async flush() {
    this.hits = 0;
    this.misses = 0;
    this.dbLoads = 0;
    this.stampedeWaits = 0;
    this.lockTimeouts = 0;
    if (this.redis) await this.redis.flushdb();
  }

  async onModuleDestroy() { this.redis?.disconnect(); }
}
