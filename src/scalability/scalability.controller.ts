import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Auth } from '../common/decorators/auth.decorator';
import { Role } from '../common/enums/role.enum';
import { ScalabilityService } from './scalability.service';

@ApiTags('scalability-testing')
@ApiBearerAuth('JWT-auth')
@Auth(Role.ADMIN)
@SkipThrottle()
@Controller('admin/scalability')
export class ScalabilityController {
  constructor(private readonly scalability: ScalabilityService) {}

  @Get('instances')
  @ApiOperation({ summary: 'Admin: health of each backend instance (stateless)' })
  instances() { return this.scalability.instances(); }
}
