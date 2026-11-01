import { ApiProperty } from '@nestjs/swagger';
export class OrderResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() status: string;
  @ApiProperty() totalAmount: string;
  @ApiProperty({ type: [Object] }) items: unknown[];
}
