import { Role } from '../../common/enums/role.enum';
export interface UserDto { id: string; email: string; username: string; firstName?: string | null; lastName?: string | null; phone?: string | null; avatar?: string | null; role: Role; isActive: boolean; createdAt: Date; updatedAt: Date }
export interface AuthUserRecord extends UserDto { passwordHash: string; loginAttempts: number }
export abstract class UsersApi {
  abstract getById(id: string): Promise<UserDto | null>;
  abstract create(input: { email: string; username: string; password: string; firstName?: string; lastName?: string; role?: Role }): Promise<UserDto>;
  abstract findAuthRecord(identifier: string): Promise<AuthUserRecord | null>;
  abstract isAccountLocked(id: string): Promise<boolean>;
  abstract recordLoginFailure(id: string): Promise<void>;
  abstract recordLoginSuccess(id: string): Promise<void>;
}
