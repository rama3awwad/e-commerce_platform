import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '.prisma/orders-client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateOrderItemDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() productId: string;
  @ApiProperty({ minimum: 1, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) quantity: number;
}
export class CreateOrderDto {
  @ApiProperty({ type: [CreateOrderItemDto] }) @IsArray() @ArrayMinSize(1) @ArrayUnique((item: CreateOrderItemDto) => item.productId, { message: 'Duplicate productIds are not allowed' }) @ValidateNested({ each: true }) @Type(() => CreateOrderItemDto) items: CreateOrderItemDto[];
}
export class UpdateOrderStatusDto { @ApiProperty({ enum: OrderStatus }) @IsEnum(OrderStatus) status: OrderStatus; }
export class OrderQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: OrderStatus }) @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @ApiPropertyOptional({ format: 'uuid', description: 'Admin only' }) @IsOptional() @IsUUID() userId?: string;
}
