import { ApiProperty } from '@nestjs/swagger';
export class OrderResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Internal order identifier used in API routes' }) id: string;
  @ApiProperty({ type: Number, example: 1, description: 'Sequential display number for customers' }) orderNumber: number;
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() status: string;
  @ApiProperty() totalAmount: string;
  @ApiProperty({ type: [Object] }) items: unknown[];
}
