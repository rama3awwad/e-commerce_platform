import { Module } from '@nestjs/common';
import { ProductsController, CategoriesController } from './products.controller';
import { ProductsService } from './products.service';
import { InventoryModule } from '../inventory/inventory.module';
@Module({ imports: [InventoryModule], controllers: [ProductsController, CategoriesController], providers: [ProductsService], exports: [ProductsService] })
export class ProductsModule {}
