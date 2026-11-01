import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'Email or username',
    example: 'user@example.com',
  })
  @IsString()
  identifier: string;

  @ApiProperty({ description: 'Password', example: 'StrongPass@123' })
  @IsString()
  @MinLength(1)
  password: string;
}
