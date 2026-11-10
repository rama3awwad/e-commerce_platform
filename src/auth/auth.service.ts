import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersApi } from '../users/api/users.api';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersApi,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Register a new user
   */
  async register(registerDto: RegisterDto) {
    // Create user via UsersService (handles password hashing & duplicate checks)
    const user = await this.usersService.create({
      email: registerDto.email,
      username: registerDto.username,
      password: registerDto.password,
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      role: undefined, // Default role (CUSTOMER) applied by Prisma
    });

    // Generate JWT token
    const accessToken = this.generateToken(user.id, user.email, user.role);

    this.logger.log(`User registered: ${user.email}`);

    return {
      accessToken,
      user,
    };
  }

  /**
   * Login with email/username + password
   * Includes account lockout protection
   */
  async login(loginDto: LoginDto) {
    const { identifier, password } = loginDto;

    // Find user by email or username
    const user = await this.usersService.findAuthRecord(identifier);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if account is active
    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated. Contact support.');
    }

    // Check if account is locked
    const isLocked = await this.usersService.isAccountLocked(user.id);
    if (isLocked) {
      const lockMinutes =
        this.configService.get<number>('ACCOUNT_LOCKOUT_DURATION_MINUTES', 15);
      throw new ForbiddenException(
        `Account is temporarily locked due to too many failed login attempts. Please try again in ${lockMinutes} minutes.`,
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      // Increment login attempts
      await this.usersService.recordLoginFailure(user.id);

      const maxAttempts =
        this.configService.get<number>('ACCOUNT_LOCKOUT_ATTEMPTS', 5);
      const remainingAttempts = maxAttempts - (user.loginAttempts + 1);

      if (remainingAttempts <= 0) {
        throw new ForbiddenException(
          'Account has been locked due to too many failed login attempts. Please try again later.',
        );
      }

      throw new UnauthorizedException(
        `Invalid credentials. ${remainingAttempts} attempt(s) remaining before account lockout.`,
      );
    }

    // Reset login attempts on successful login
    await this.usersService.recordLoginSuccess(user.id);

    // Generate JWT token
    const accessToken = this.generateToken(user.id, user.email, user.role);

    // Return user without password
    const { passwordHash: _, loginAttempts: __, ...userResponse } = user;

    this.logger.log(`User logged in: ${user.email}`);

    return {
      accessToken,
      user: userResponse,
    };
  }

  /**
   * Generate JWT token
   */
  private generateToken(userId: string, email: string, role: string): string {
    const payload = { sub: userId, email, role };

    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_EXPIRATION', '1d'),
    });
  }
}
