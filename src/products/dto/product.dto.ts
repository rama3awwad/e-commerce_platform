import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ProductQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
}
export class CreateProductDto {
  @ApiProperty() @IsString() @Length(2, 160) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ example: 29.99 }) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) price: number;
  @ApiProperty() @IsString() categoryId: string;
}
export class UpdateProductDto extends PartialType(CreateProductDto) {}
export class SetStockDto { @ApiProperty({ minimum: 0 }) @Type(() => Number) @IsInt() @Min(0) quantity: number; }
