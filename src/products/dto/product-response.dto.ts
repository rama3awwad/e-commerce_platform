import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class ProductResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() price: string;
  @ApiProperty() categoryId: string;
  @ApiProperty() stock: number;
  @ApiPropertyOptional() imageUrl?: string;
}
