import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
@Injectable()
export class InternalApiGuard implements CanActivate { constructor(private readonly config:ConfigService){} canActivate(context:ExecutionContext){const expected=this.config.get<string>('INTERNAL_API_TOKEN')||'';const got=String(context.switchToHttp().getRequest().headers['x-internal-token']||'');if(!expected||expected.length<16||Buffer.byteLength(got)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(got),Buffer.from(expected)))throw new ForbiddenException();return true;} }
