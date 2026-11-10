import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersApi } from '../../users/api/users.api';
interface JwtPayload { sub:string; email:string; role:string }
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly cache = new Map<string,{user:any;expiresAt:number}>();
  private readonly cacheTtlMs:number;
 constructor(private readonly configService:ConfigService,private readonly users:UsersApi){super({jwtFromRequest:ExtractJwt.fromAuthHeaderAsBearerToken(),ignoreExpiration:false,secretOrKey:configService.get<string>('JWT_SECRET')});this.cacheTtlMs=Number(configService.get<string>('JWT_USER_CACHE_TTL_SECONDS','60'))*1000;}
 async validate(payload:JwtPayload){let user:any;const cached=this.cache.get(payload.sub);if(this.cacheTtlMs>0&&cached&&cached.expiresAt>Date.now())user=cached.user;else{this.cache.delete(payload.sub);user=await this.users.getById(payload.sub);if(user&&this.cacheTtlMs>0)this.cache.set(payload.sub,{user,expiresAt:Date.now()+this.cacheTtlMs});}if(!user||!user.isActive)throw new UnauthorizedException(!user?'User not found':'Account is deactivated');return user;}
}
