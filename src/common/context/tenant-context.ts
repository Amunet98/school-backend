import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Mutable per-request store. A middleware opens the AsyncLocalStorage scope
 * before auth has run (fields start empty); JwtAuthGuard fills in the real
 * values once the token is verified. Because it's the *same* object
 * reference for the lifetime of the request, later reads (e.g. from the
 * Prisma tenant-scoping extension) see the guard's updates.
 */
export interface TenantStore {
  schoolId: bigint | null;
  userId: bigint | null;
  roles: string[];
}

export const tenantContext = new AsyncLocalStorage<TenantStore>();

export function emptyTenantStore(): TenantStore {
  return { schoolId: null, userId: null, roles: [] };
}
