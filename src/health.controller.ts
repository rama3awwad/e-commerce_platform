import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';

@ApiTags('health')
// version '1' → the full path is /api/v1/health — every public URL includes the API version
@Controller({ path: 'health', version: '1' })
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiOkResponse({
    description: 'API is healthy',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            timestamp: { type: 'string', example: '2026-10-27T12:00:00.000Z' },
            uptime: { type: 'number', example: 123.45 },
            environment: { type: 'string', example: 'development' },
          },
        },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
