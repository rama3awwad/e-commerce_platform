import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../common/enums/role.enum';

export class UserResponseDto {
  @ApiProperty({
    description: 'Unique user identifier (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({ description: 'Email address', example: 'user@example.com' })
  email: string;

  @ApiProperty({ description: 'Username', example: 'johndoe' })
  username: string;

  @ApiProperty({ description: 'First name', example: 'John', nullable: true })
  firstName: string | null;

  @ApiProperty({ description: 'Last name', example: 'Doe', nullable: true })
  lastName: string | null;

  @ApiProperty({
    description: 'Phone number',
    example: '+963912345678',
    nullable: true,
  })
  phone: string | null;

  @ApiProperty({
    description: 'Avatar URL',
    example: 'https://cdn.example.com/avatars/johndoe.png',
    nullable: true,
  })
  avatar: string | null;

  @ApiProperty({
    description: 'User role',
    enum: Role,
    example: Role.CUSTOMER,
    enumName: 'Role',
  })
  role: Role;

  @ApiProperty({ description: 'Account active status', example: true })
  isActive: boolean;

  @ApiProperty({
    description: 'Account creation date',
    example: '2026-10-27T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update date',
    example: '2026-10-27T12:30:00.000Z',
  })
  updatedAt: Date;
}


