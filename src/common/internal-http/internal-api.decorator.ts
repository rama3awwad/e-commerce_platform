import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InternalApiGuard } from './internal-api.guard';
export function InternalApi(){return applyDecorators(UseGuards(InternalApiGuard),SkipThrottle(),ApiExcludeController());}
