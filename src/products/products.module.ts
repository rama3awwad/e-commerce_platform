import { Module } from '@nestjs/common';
import { InternalHttpModule } from '../common/internal-http/internal-http.module';
import { ProductsController, CategoriesController } from './products.controller';
import { InternalProductsController } from './internal-products.controller';
import { ProductsService } from './products.service';
import { ProductsPrismaService } from './prisma/products-prisma.service';
import { InventoryModule } from '../inventory/inventory.module';
@Module({imports:[InventoryModule,InternalHttpModule],controllers:[ProductsController,CategoriesController,InternalProductsController],providers:[ProductsService,ProductsPrismaService]}) export class ProductsModule {}
