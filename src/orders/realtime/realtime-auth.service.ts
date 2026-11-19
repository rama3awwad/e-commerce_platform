import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InternalHttpClient } from '../../common/internal-http/internal-http.client';
import { Role } from '../../common/enums/role.enum';

export interface RealtimeUser { id: string; role: Role; email: string }

/**
 * المتطلب الرابع (الصلاحيات): التحقق من هوية المستخدم قبل السماح له بالاتصال بالـ WebSocket.
 * 1) التوكن (JWT) يجب أن يكون صالحاً وغير منتهٍ.
 * 2) نجلب المستخدم من موديول users (عبر الـ internal HTTP كبقية الموديولات) للتأكد أنه فعّال وللحصول على دوره الحالي.
 */
@Injectable()
export class RealtimeAuthService {
  private readonly cache = new Map<string, { user: RealtimeUser; expiresAt: number }>();
  private readonly cacheTtlMs: number;

  constructor(private readonly jwt: JwtService, private readonly client: InternalHttpClient, private readonly config: ConfigService) {
    this.cacheTtlMs = Number(config.get<string>('JWT_USER_CACHE_TTL_SECONDS', '60')) * 1000;
  }

  private get usersUrl() { return this.config.get<string>('USERS_API_URL', `http://localhost:${this.config.get('PORT', '3000')}/api/v1`); }

  async authenticate(token?: string): Promise<RealtimeUser> {
    if (!token || typeof token !== 'string') throw new UnauthorizedException('Missing token');
    let sub: string;
    try { sub = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub; }
    catch { throw new UnauthorizedException('Invalid or expired token'); }

    const cached = this.cache.get(sub);
    if (this.cacheTtlMs > 0 && cached && cached.expiresAt > Date.now()) return cached.user;
    this.cache.delete(sub);

    let found: { id: string; email: string; role: Role; isActive: boolean } | null = null;
    try { found = await this.client.request('GET', `${this.usersUrl}/internal/users/${sub}`); }
    catch (e: any) { if (e?.response?.status !== 404) throw e; }
    if (!found) throw new UnauthorizedException('User not found');
    if (!found.isActive) throw new UnauthorizedException('Account is deactivated');

    const user: RealtimeUser = { id: found.id, role: found.role, email: found.email };
    if (this.cacheTtlMs > 0) this.cache.set(sub, { user, expiresAt: Date.now() + this.cacheTtlMs });
    return user;
  }
}