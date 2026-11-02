import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class ProductResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() price: string;
  @ApiProperty({ format: 'uuid' }) categoryId: string;
  @ApiProperty() stock: number;
  @ApiPropertyOptional() imageUrl?: string;
}
