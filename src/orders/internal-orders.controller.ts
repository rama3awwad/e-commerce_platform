import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { InternalApi } from '../common/internal-http/internal-api.decorator';
import { OrdersPrismaService } from './prisma/orders-prisma.service';
@InternalApi() @Controller('internal/orders') export class InternalOrdersController {constructor(private readonly prisma:OrdersPrismaService){} @Get('users/:userId/has-orders') async hasOrders(@Param('userId',ParseUUIDPipe) userId:string){return {hasOrders:(await this.prisma.order.count({where:{userId}}))>0};}}
