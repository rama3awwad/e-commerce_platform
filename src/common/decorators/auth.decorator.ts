import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Role } from '@prisma/client';
import { Roles } from './roles.decorator';

export function Auth(...roles: Role[]) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth('JWT-auth'),
    Roles(...roles),
    ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or missing JWT token' }),
    roles.length > 0
      ? ApiForbiddenResponse({ description: 'Forbidden - Insufficient role permissions' })
      : () => {},
  );
}
