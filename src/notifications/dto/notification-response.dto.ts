import { ApiProperty } from '@nestjs/swagger';
export class NotificationResponseDto { @ApiProperty() id: string; @ApiProperty() type: string; @ApiProperty() title: string; @ApiProperty() message: string; @ApiProperty() isRead: boolean; }
