import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

/** pusher-js يرسل هذين الحقلين (form-urlencoded) عند الاشتراك بقناة خاصة. */
export class RealtimeAuthDto {
  @ApiProperty({ example: '123.456', description: 'socket id الذي أعطاه Soketi للمتصفح' })
  @IsString() @Matches(/^\d+\.\d+$/) socket_id: string;

  @ApiProperty({ example: 'private-admin.orders' })
  @IsString() @MaxLength(200) channel_name: string;
}