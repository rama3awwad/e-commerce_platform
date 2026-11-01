import { ApiProperty } from '@nestjs/swagger';

/**
 * Standard message response (used by DELETE endpoints)
 */
export class MessageResponseDto {
  @ApiProperty({
    description: 'Human-readable result message',
    example: 'User deleted successfully',
  })
  message: string;
}
