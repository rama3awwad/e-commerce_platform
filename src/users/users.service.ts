import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new user
   */
  async create(createUserDto: CreateUserDto) {
    // Check if email already exists
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });
    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    // Check if username already exists
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: createUserDto.username },
    });
    if (existingUsername) {
      throw new ConflictException('Username already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        username: createUserDto.username,
        password: hashedPassword,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        phone: createUserDto.phone,
        role: createUserDto.role,
      },
    });

    this.logger.log(`User created: ${user.id} (${user.email})`);
    return this.excludePassword(user);
  }

  /**
   * Find all users with pagination
   */
  async findAll(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponse<any>> {
    const { page = 1, limit = 10, search } = paginationDto;
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { username: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items: users.map((user) => this.excludePassword(user)),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Find a single user by ID
   */
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return this.excludePassword(user);
  }

  /**
   * Find user by email (includes password for auth)
   */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Find user by username (includes password for auth)
   */
  async findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  /**
   * Update a user
   */
  async update(id: string, updateUserDto: UpdateUserDto) {
    // Check if user exists
    await this.findOne(id);

    // Check for email conflict
    if (updateUserDto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });
      if (existingEmail && existingEmail.id !== id) {
        throw new ConflictException('Email already in use by another account');
      }
    }

    // Check for username conflict
    if (updateUserDto.username) {
      const existingUsername = await this.prisma.user.findUnique({
        where: { username: updateUserDto.username },
      });
      if (existingUsername && existingUsername.id !== id) {
        throw new ConflictException('Username already in use by another account');
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    });

    this.logger.log(`User updated: ${id}`);
    return this.excludePassword(user);
  }

  /**
   * Delete a user
   * @param id - the ID of the user to delete
   * @param requesterId - the ID of the authenticated admin (cannot delete himself)
   */
  async remove(id: string, requesterId: string) {
    // An admin cannot delete his own account (prevents deleting the last admin)
    if (id === requesterId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    // Check if user exists
    await this.findOne(id);

    await this.prisma.user.delete({
      where: { id },
    });

    this.logger.log(`User deleted: ${id}`);
    return { message: 'User deleted successfully' };
  }

  /**
   * Increment login attempts for account lockout
   */
  async incrementLoginAttempts(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return;

    const loginAttempts = user.loginAttempts + 1;
    const lockUntil =
      loginAttempts >= (parseInt(process.env.ACCOUNT_LOCKOUT_ATTEMPTS || '5', 10))
        ? new Date(
            Date.now() +
              parseInt(process.env.ACCOUNT_LOCKOUT_DURATION_MINUTES || '15', 10) *
                60 *
                1000,
          )
        : null;

    await this.prisma.user.update({
      where: { id },
      data: { loginAttempts, lockUntil },
    });
  }

  /**
   * Reset login attempts after successful login
   */
  async resetLoginAttempts(id: string) {
    await this.prisma.user.update({
      where: { id },
      data: { loginAttempts: 0, lockUntil: null },
    });
  }

  /**
   * Check if account is locked
   */
  async isAccountLocked(id: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return false;

    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      return true;
    }

    // If lock period has expired, reset
    if (user.lockUntil && new Date(user.lockUntil) <= new Date()) {
      await this.prisma.user.update({
        where: { id },
        data: { loginAttempts: 0, lockUntil: null },
      });
    }

    return false;
  }

  /**
   * Exclude password from user object
   */
  private excludePassword(user: any) {
    const { password, loginAttempts, lockUntil, ...result } = user;
    return result;
  }
}
