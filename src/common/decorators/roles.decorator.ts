import { SetMetadata } from '@nestjs/common';
import type { UserRoleName } from '../interfaces/jwt-payload.interface';

export const ROLES_KEY = 'roles';

/** Route is accessible if the caller has ANY of the listed roles. */
export const Roles = (...roles: UserRoleName[]) => SetMetadata(ROLES_KEY, roles);
