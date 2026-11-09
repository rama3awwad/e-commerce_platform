import { Controller, Post, Body, Get, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import 'dotenv/config';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserResponseDto } from '../users/api/user-response.dto';
import { Auth } from '../common/decorators/auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
} from '../common/swagger/swagger.decorators';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: Number(process.env.LOGIN_THROTTLE_LIMIT || 5), ttl: Number(process.env.LOGIN_THROTTLE_TTL || 60000) } })
  @ApiOperation({
    summary: 'Register a new customer account',
    description:
      'Public endpoint — no token needed. Creates a new account that is ALWAYS assigned the `CUSTOMER` role (the request body has no `role` field by design). '
      + 'To create an `ADMIN` account, log in as an admin first and use `POST /users` instead.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiSuccessResponse(AuthResponseDto, 201, 'User registered successfully — returns JWT + user')
  @ApiErrorResponse(
    400,
    'Validation failed (bad email, short password, missing fields, or extra unknown fields)',
    ['password must be longer than or equal to 8 characters', 'email must be an email'],
    'Bad Request',
  )
  @ApiErrorResponse(
    409,
    'Email or username already exists',
    'Email already exists',
    'Conflict',
  )
  @ApiErrorResponse(
    429,
    'Too many requests — rate limit exceeded',
    'ThrottlerException: Too Many Requests',
    'Too Many Requests',
  )
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: Number(process.env.LOGIN_THROTTLE_LIMIT || 5), ttl: Number(process.env.LOGIN_THROTTLE_TTL || 60000) } })
  @ApiOperation({
    summary: 'Login with email OR username + password',
    description:
      'Public endpoint — no token needed. `identifier` accepts either the email or the username. '
      + 'Returns a JWT `accessToken` (valid for the duration set in JWT_EXPIRES_IN) + the user object. '
      + 'Use the two example buttons below to switch between email login and username login. '
      + 'After 5 failed attempts the account is locked for 15 minutes (403).',
  })
  @ApiBody({
    type: LoginDto,
    examples: {
      'Admin (email)': {
        summary: 'Login as seeded admin using email',
        value: { identifier: 'admin@store.com', password: 'Admin@123' },
      },
      'Admin (username)': {
        summary: 'Login as seeded admin using username',
        value: { identifier: 'admin', password: 'Admin@123' },
      },
      'Customer (email)': {
        summary: 'Login as seeded customer using email',
        value: { identifier: 'customer@test.com', password: 'Admin@123' },
      },
    },
  })
  @ApiSuccessResponse(AuthResponseDto, 200, 'Login successful — returns JWT + user')
  @ApiErrorResponse(
    400,
    'Validation failed (missing identifier or password)',
    ['identifier must be a string', 'password must be longer than or equal to 1 characters'],
    'Bad Request',
  )
  @ApiErrorResponse(
    401,
    'Invalid credentials (wrong password or unknown user). Includes remaining attempts before lockout',
    'Invalid credentials. 4 attempt(s) remaining before account lockout.',
    'Unauthorized',
  )
  @ApiErrorResponse(
    403,
    'Account locked after too many failed attempts, or deactivated',
    'Account is temporarily locked due to too many failed login attempts. Please try again in 15 minutes.',
    'Forbidden',
  )
  @ApiErrorResponse(
    429,
    'Too many requests — rate limit exceeded',
    'ThrottlerException: Too Many Requests',
    'Too Many Requests',
  )
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('me')
  @Auth()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current authenticated user info (session check)',
    description:
      'Requires a valid token (click 🔒 Authorize first). Call this on app startup to restore the session: '
      + 'if 200 → user is logged in, if 401 → redirect to login screen. Returns fresh user data from the server (role, isActive, etc.).',
  })
  @ApiSuccessResponse(UserResponseDto, 200, 'Current authenticated user')
  @ApiErrorResponse(
    401,
    'Missing, invalid, or expired JWT token',
    'Unauthorized',
    'Unauthorized',
  )
  getMe(@CurrentUser() user: any) {
    return user;
  }
}
