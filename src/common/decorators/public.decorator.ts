import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as not requiring a JWT (login, refresh, OTP request/verify). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
