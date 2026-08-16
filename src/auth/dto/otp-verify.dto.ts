import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LOGIN_ROLES } from '../../common/interfaces/jwt-payload.interface';
import type { UserRoleName } from '../../common/interfaces/jwt-payload.interface';

export class OtpVerifyDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  // Same intended-role gate as LoginDto.role.
  @IsOptional()
  @IsIn(LOGIN_ROLES)
  role?: UserRoleName;
}
