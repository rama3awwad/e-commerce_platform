import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT access token — send it in the Authorization header as: Bearer <token>',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMCIsImVtYWlsIjoidXNlckBleGFtcGxlLmNvbSIsInJvbGUiOiJDVVNUT01FUiIsImlhdCI6MTcwMDAwMDAwMHQ.xxxxxxxxxxxxx',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Authenticated user information (never includes the password)',
    type: UserResponseDto,
  })
  user: UserResponseDto;
}
