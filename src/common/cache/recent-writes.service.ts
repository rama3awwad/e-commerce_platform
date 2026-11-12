import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * المتطلب الثالث — Read Replica و"اقرأ ما كتبته" (read-your-writes).
 *
 * النسخة (replica) تتأخر قليلاً عن القاعدة الأساسية. لو أنشأ المستخدم طلباً ثم فتح قائمة طلباته
 * فوراً من الـreplica قد لا يجده. الحل: بعد أي كتابة نضع علامة لمدة قصيرة
 * (READ_YOUR_WRITES_WINDOW_MS، افتراضياً 5 ثوانٍ)، وخلالها نقرأ من القاعدة الأساسية.
 *
 *   - المنتجات: علامة عامة "products" لأن المنتج يراه كل المستخدمين.
 *   - الطلبات:  علامة لكل مستخدم "orders:user:<id>" لأن الطلب يخص صاحبه فقط.
 *
 * العلامة تُحفظ في Redis (تعمل مع أكثر من نسخة backend)، ومع ذاكرة محلية احتياطية إن توقف Redis.
 */
@Injectable()
export class RecentWritesService {
  readonly windowMs = Number(process.env.READ_YOUR_WRITES_WINDOW_MS || 5000);
  private readonly local = new Map<string, number>();

  constructor(private readonly cache: CacheService) {}

  async mark(...scopes: string[]): Promise<void> {
    const until = Date.now() + this.windowMs;
    for (const scope of scopes) {
      this.local.set(scope, until);
      try { await this.cache.redis?.set(`recent-write:${scope}`, '1', 'PX', this.windowMs); } catch { /* local fallback */ }
    }
  }

  async isRecent(scope: string): Promise<boolean> {
    const localUntil = this.local.get(scope);
    if (localUntil && localUntil > Date.now()) return true;
    if (localUntil) this.local.delete(scope);
    try { return (await this.cache.redis?.exists(`recent-write:${scope}`)) === 1; } catch { return false; }
  }
}
