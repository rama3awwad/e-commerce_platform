import { Module } from '@nestjs/common';
import { InternalHttpModule } from '../common/internal-http/internal-http.module';
import { NotificationsController } from './notifications.controller';
import { InternalNotificationsController } from './internal-notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsPrismaService } from './prisma/notifications-prisma.service';
@Module({imports:[InternalHttpModule],controllers:[NotificationsController,InternalNotificationsController],providers:[NotificationsService,NotificationsPrismaService]}) export class NotificationsModule {}
