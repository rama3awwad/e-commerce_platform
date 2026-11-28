import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Role } from '../../common/enums/role.enum';
import { Auth } from '../../common/decorators/auth.decorator';
import { EmailJobsService } from './email-jobs.service';
import { EmailJobsQueryDto, UpdateMailSettingsDto } from './email-jobs.dto';

@ApiTags('email-jobs') @ApiBearerAuth('JWT-auth') @Controller('admin/email-jobs')
export class EmailJobsController {
  constructor(private readonly jobs: EmailJobsService) {}
  @Get() @Auth(Role.ADMIN) @ApiOperation({ summary: 'Admin: email jobs with status, attempts and counts (DEAD = dead-letter queue)' })
  list(@Query() query: EmailJobsQueryDto) { return this.jobs.list(query); }
  @Get('workers') @Auth(Role.ADMIN) @SkipThrottle() @ApiOperation({ summary: 'Admin: queue consumers and jobs processed per worker' })
  workers() { return this.jobs.workersOverview(); }
  @Get('settings') @Auth(Role.ADMIN) @ApiOperation({ summary: 'Admin: current mail simulation settings' })
  settings() { return this.jobs.getSettings(); }
  @Patch('settings') @Auth(Role.ADMIN) @ApiOperation({ summary: 'Admin: make every email attempt fail on purpose (demo retry/DLQ)' })
  updateSettings(@Body() dto: UpdateMailSettingsDto) { return this.jobs.setForceFail(dto.forceFail); }
  @Post(':id/requeue') @HttpCode(200) @Auth(Role.ADMIN) @ApiOperation({ summary: 'Admin: send a dead-lettered email job through the queue again' })
  requeue(@Param('id', ParseUUIDPipe) id: string) { return this.jobs.requeue(id); }
}
