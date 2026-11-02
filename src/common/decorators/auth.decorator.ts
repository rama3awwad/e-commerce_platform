import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Role } from '@prisma/client';
import { Roles } from './roles.decorator';
import { ApiErrorResponse } from '../swagger/swagger.decorators';

export function Auth(...roles: Role[]) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth('JWT-auth'),
    Roles(...roles),
    ApiErrorResponse(401, 'Missing, invalid, or expired JWT token', 'Unauthorized', 'Unauthorized'),
    roles.length > 0
      ? ApiErrorResponse(403, 'Authenticated user does not have the required role', 'Forbidden', 'Forbidden')
      : () => {},
  );
}
