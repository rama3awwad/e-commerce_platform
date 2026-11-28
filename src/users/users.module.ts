import { Module } from '@nestjs/common';
import { InternalHttpModule } from '../common/internal-http/internal-http.module';
import { UsersController } from './users.controller';
import { InternalUsersController } from './internal-users.controller';
import { UsersService } from './users.service';
import { UsersPrismaService } from './prisma/users-prisma.service';
import { OrdersApi } from '../orders/api/orders.api';
import { NotificationsApi } from '../notifications/api/notifications.api';
import { HttpOrdersApi } from './clients/http-orders.api';
import { HttpNotificationsApi } from './clients/http-notifications.api';
import { CacheModule } from '../common/cache/cache.module';
@Module({imports:[CacheModule,InternalHttpModule],controllers:[UsersController,InternalUsersController],providers:[UsersService,UsersPrismaService,{provide:OrdersApi,useClass:HttpOrdersApi},{provide:NotificationsApi,useClass:HttpNotificationsApi}]}) export class UsersModule {}
