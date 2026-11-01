import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Auth } from '../common/decorators/auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApiSuccessResponse,
  ApiPaginatedResponse,
  ApiErrorResponse,
} from '../common/swagger/swagger.decorators';
import { Role } from '@prisma/client';

@ApiTags('users')
@ApiBearerAuth('JWT-auth')
@ApiErrorResponse(401, 'Missing, invalid, or expired JWT token', 'Unauthorized', 'Unauthorized')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Auth(Role.ADMIN)
  @ApiOperation({
    summary: 'Create a new user (Admin only)',
    description:
      'The only way to create an `ADMIN` account. `role` is optional and defaults to `CUSTOMER` — set it to `ADMIN` when needed. '
      + 'Email and username must be unique (409 otherwise).',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiSuccessResponse(UserResponseDto, 201, 'User created successfully')
  @ApiErrorResponse(
    400,
    'Validation failed (bad email, short password/username, invalid role)',
    ['email must be an email', 'password must be longer than or equal to 8 characters'],
    'Bad Request',
  )
  @ApiErrorResponse(403, 'Authenticated user is not ADMIN', 'Forbidden resource', 'Forbidden')
  @ApiErrorResponse(409, 'Email or username already exists', 'Email already exists', 'Conflict')
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Auth(Role.ADMIN)
  @ApiOperation({
    summary: 'Get all users — paginated + searchable (Admin only)',
    description:
      'All query params are OPTIONAL — clear them all and the server applies defaults (page=1, limit=10). '
      + '`page` = which page, `limit` = items per page (default 10, MAX 100 — 400 error above that), '
      + '`search` = case-insensitive match in email, username, firstName, lastName. '
      + 'Example: `/users?page=1&limit=10&search=ahmad`. The response `meta` object tells the frontend how many pages exist (totalPages, hasNext, hasPrev).',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10, description: 'Items per page (default 10, max 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, example: 'ahmad', description: 'Search in email, username, firstName, lastName' })
  @ApiPaginatedResponse(UserResponseDto, 'Paginated list of users')
  @ApiErrorResponse(403, 'Authenticated user is not ADMIN', 'Forbidden resource', 'Forbidden')
  findAll(@Query() paginationDto: PaginationDto) {
    return this.usersService.findAll(paginationDto);
  }

  @Get('profile')
  @Auth()
  @ApiOperation({
    summary: 'Get my own profile (any authenticated user)',
    description:
      'Works for both CUSTOMER and ADMIN — no special role required. Uses the ID stored inside the JWT token, so the user can only ever read his own profile.',
  })
  @ApiSuccessResponse(UserResponseDto, 200, 'Current user profile')
  getProfile(@CurrentUser() user: any) {
    return this.usersService.findOne(user.id);
  }

  @Get(':id')
  @Auth(Role.ADMIN)
  @ApiOperation({
    summary: 'Get user by ID (Admin only)',
    description:
      'ID must be a valid UUID (400 otherwise). Use `GET /users` first to obtain the list of IDs.',
  })
  @ApiParam({ name: 'id', description: 'User UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiSuccessResponse(UserResponseDto, 200, 'User details')
  @ApiErrorResponse(400, 'ID is not a valid UUID', ['id must be a UUID'], 'Bad Request')
  @ApiErrorResponse(403, 'Authenticated user is not ADMIN', 'Forbidden resource', 'Forbidden')
  @ApiErrorResponse(404, 'User not found', 'User with ID "..." not found', 'Not Found')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Put(':id')
  @Auth(Role.ADMIN)
  @ApiOperation({
    summary: 'Update user by ID (Admin only)',
    description:
      'Partial update — send ONLY the fields you want to change (e.g. `{ "role": "ADMIN" }` to promote a user). '
      + 'Password cannot be changed here (a change-password endpoint comes in a later phase). '
      + '`isActive: false` deactivates the account = the user can no longer log in.',
  })
  @ApiParam({ name: 'id', description: 'User UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiBody({ type: UpdateUserDto })
  @ApiSuccessResponse(UserResponseDto, 200, 'User updated successfully')
  @ApiErrorResponse(400, 'Validation failed or ID is not a valid UUID', ['id must be a UUID'], 'Bad Request')
  @ApiErrorResponse(403, 'Authenticated user is not ADMIN', 'Forbidden resource', 'Forbidden')
  @ApiErrorResponse(404, 'User not found', 'User with ID "..." not found', 'Not Found')
  @ApiErrorResponse(409, 'New email/username already used by another account', 'Email already in use by another account', 'Conflict')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Auth(Role.ADMIN)
  @ApiOperation({
    summary: 'Delete user by ID (Admin only)',
    description:
      'Permanent delete (no soft delete). An admin CANNOT delete his own account (400) — this prevents accidentally deleting the last admin.',
  })
  @ApiParam({ name: 'id', description: 'User UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiSuccessResponse(MessageResponseDto, 200, 'User deleted successfully')
  @ApiErrorResponse(
    400,
    'Trying to delete your own account',
    'You cannot delete your own account',
    'Bad Request',
  )
  @ApiErrorResponse(403, 'Authenticated user is not ADMIN', 'Forbidden resource', 'Forbidden')
  @ApiErrorResponse(404, 'User not found', 'User with ID "..." not found', 'Not Found')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.usersService.remove(id, user.id);
  }
}
