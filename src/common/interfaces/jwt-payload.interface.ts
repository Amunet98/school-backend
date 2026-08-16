export type UserRoleName =
  'super_admin' | 'school_admin' | 'teacher' | 'guardian';

// The roles a client may pass as its *intended* role on login/otp-verify
// (e.g. which welcome-screen card the user picked). super_admin is
// deliberately excluded — no client-facing flow offers it.
export const LOGIN_ROLES = ['school_admin', 'teacher', 'guardian'] as const;

/** Access-token payload. school_id is null only for super_admin. */
export interface JwtAccessPayload {
  user_id: string;
  school_id: string | null;
  roles: UserRoleName[];
  type: 'access';
}

export interface JwtRefreshPayload {
  user_id: string;
  type: 'refresh';
}

/** Shape attached to `request.user` after JwtAuthGuard verifies the token. */
export interface AuthenticatedUser {
  userId: bigint;
  schoolId: bigint | null;
  roles: UserRoleName[];
}
