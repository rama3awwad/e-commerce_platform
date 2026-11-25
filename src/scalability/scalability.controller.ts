import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Auth } from '../common/decorators/auth.decorator';
import { Role } from '../common/enums/role.enum';
import { ScalabilityService } from './scalability.service';

@ApiTags('scalability-testing')
@ApiBearerAuth('JWT-auth')
@Auth(Role.ADMIN)
@Controller('admin/scalability-tests')
export class ScalabilityController {
  constructor(private readonly tests: ScalabilityService) {}

  @Post('load') @HttpCode(202)
  start(@Body() body: { requests: number; concurrency: number; endpoint: string }) { return this.tests.startLoad(body); }

  @Get('history') history() { return this.tests.history(); }

  @Get(':id')
  get(@Param('id') id: string) { const result = this.tests.get(id); if (!result) throw new NotFoundException(); return result; }

  @Post(':id/probes') @HttpCode(200)
  record(@Param('id') id: string, @Body() body: { at: string; ok: boolean; status: number | null; latencyMs: number; instance: string | null; error?: string }) { const result = this.tests.record(id, body); if (!result) throw new NotFoundException(); return result; }

  @Post(':id/finish') @HttpCode(200)
  finish(@Param('id') id: string, @Body() body: { status: 'completed' | 'stopped' }) { const result = this.tests.finish(id, body.status); if (!result) throw new NotFoundException(); return result; }

  @Post(':id/stop') stop(@Param('id') id: string) { const result = this.tests.stop(id); if (!result) throw new NotFoundException(); return result; }
}
