import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CacheService } from '../../common/cache/cache.service';
import { UsersApi } from '../../users/api/users.api';

interface JwtPayload { sub: string; email: string; role: string }
export const authUserCacheKey = (id: string) => `auth:user:${id}`;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly cacheTtlSeconds: number;
  constructor(private readonly configService: ConfigService, private readonly users: UsersApi, private readonly cache: CacheService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: configService.get<string>('JWT_SECRET') });
    this.cacheTtlSeconds = Number(configService.get<string>('JWT_USER_CACHE_TTL_SECONDS', '60'));
  }

  async validate(payload: JwtPayload) {
    let user = this.cacheTtlSeconds > 0 ? await this.cache.getJson<any>(authUserCacheKey(payload.sub)) : null;
    if (user) {
      if (user.createdAt) user.createdAt = new Date(user.createdAt);
      if (user.updatedAt) user.updatedAt = new Date(user.updatedAt);
    } else {
      user = await this.users.getById(payload.sub);
      if (user && this.cacheTtlSeconds > 0) await this.cache.setJson(authUserCacheKey(payload.sub), user, this.cacheTtlSeconds);
    }
    if (!user || !user.isActive) throw new UnauthorizedException(!user ? 'User not found' : 'Account is deactivated');
    return user;
  }
}
