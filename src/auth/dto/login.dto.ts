import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { LOGIN_ROLES } from '../../common/interfaces/jwt-payload.interface';
import type { UserRoleName } from '../../common/interfaces/jwt-payload.interface';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  // The role the client intends to sign in as (e.g. which welcome-screen
  // card was picked). If set and the account doesn't hold it, login is
  // rejected (403) instead of silently succeeding into a different role.
  @IsOptional()
  @IsIn(LOGIN_ROLES)
  role?: UserRoleName;
}
