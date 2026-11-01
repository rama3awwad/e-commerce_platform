import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Auth } from '../common/decorators/auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorResponse, ApiPaginatedResponse, ApiSuccessResponse } from '../common/swagger/swagger.decorators';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationsService } from './notifications.service';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationActionResponseDto } from './dto/notification-action-response.dto';

@ApiTags('notifications') @ApiBearerAuth('JWT-auth') @Auth() @Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() @ApiPaginatedResponse(NotificationResponseDto, 'Your notifications, newest first; meta includes unreadCount') list(@CurrentUser('id') userId: string, @Query() query: NotificationQueryDto) { return this.notifications.list(userId, query); }
  @Patch('read-all') @ApiSuccessResponse(NotificationActionResponseDto) markAll(@CurrentUser('id') userId: string) { return this.notifications.markAllRead(userId); }
  @Patch(':id/read') @ApiSuccessResponse(NotificationResponseDto) @ApiErrorResponse(403, 'Notification belongs to another user', 'This notification belongs to another user', 'Forbidden') @ApiErrorResponse(404, 'Notification not found', 'Notification not found', 'Not Found') markRead(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.notifications.markRead(userId, id); }
}
