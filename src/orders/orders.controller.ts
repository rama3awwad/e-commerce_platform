import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Auth } from '../common/decorators/auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorResponse, ApiPaginatedResponse, ApiSuccessResponse } from '../common/swagger/swagger.decorators';
import { OrdersService } from './orders.service';
import { CreateOrderDto, OrderQueryDto, UpdateOrderStatusDto } from './dto/order.dto';
import { OrderResponseDto } from './dto/order-response.dto';

@ApiTags('orders') @ApiBearerAuth('JWT-auth') @Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Post() @Auth(Role.CUSTOMER) @ApiSuccessResponse(OrderResponseDto, 201, 'Order created') @ApiErrorResponse(409, 'Insufficient stock', 'Insufficient inventory for one or more products', 'Conflict') create(@CurrentUser('id') userId: string, @Body() dto: CreateOrderDto) { return this.orders.create(userId, dto); }
  @Get() @Auth() @ApiPaginatedResponse(OrderResponseDto, 'Customer own orders; admin all orders') list(@CurrentUser() user: { id: string; role: Role }, @Query() query: OrderQueryDto) { return this.orders.list(user, query); }
  @Get(':id') @Auth() @ApiSuccessResponse(OrderResponseDto) @ApiErrorResponse(403, 'Order belongs to another user', 'You cannot access this order', 'Forbidden') find(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string; role: Role }) { return this.orders.findOne(id, user); }
  @Patch(':id/status') @Auth(Role.ADMIN) @ApiSuccessResponse(OrderResponseDto) @ApiErrorResponse(409, 'Invalid status transition', 'Cannot change order status', 'Conflict') updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderStatusDto, @CurrentUser() user: { id: string; role: Role }) { return this.orders.changeStatus(id, dto.status, user); }
  @Post(':id/cancel') @Auth() @ApiSuccessResponse(OrderResponseDto) cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { id: string; role: Role }) { return this.orders.cancel(id, user); }
}
