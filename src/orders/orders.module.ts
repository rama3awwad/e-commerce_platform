import { Module } from '@nestjs/common';
import { InternalHttpModule } from '../common/internal-http/internal-http.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersController } from './orders.controller';
import { InternalOrdersController } from './internal-orders.controller';
import { OrdersService } from './orders.service';
import { OrdersPrismaService } from './prisma/orders-prisma.service';
import { ProductsApi } from '../products/api/products.api';
import { NotificationsApi } from '../notifications/api/notifications.api';
import { HttpProductsApi } from './clients/http-products.api';
import { HttpNotificationsApi } from './clients/http-notifications.api';
@Module({imports:[InventoryModule,InternalHttpModule],controllers:[OrdersController,InternalOrdersController],providers:[OrdersService,OrdersPrismaService,{provide:ProductsApi,useClass:HttpProductsApi},{provide:NotificationsApi,useClass:HttpNotificationsApi}]}) export class OrdersModule {}
