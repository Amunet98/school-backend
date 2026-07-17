import { Prisma } from '@prisma/client';
import { tenantContext } from '../context/tenant-context';
import { SCOPED_READ_WRITE_OPERATIONS, TENANT_MODELS } from './tenant-models';

/**
 * Defense-in-depth ONLY. Services must still filter by school_id from the
 * JWT explicitly — this extension is a safety net that auto-injects a
 * school_id filter into queries against tenant-scoped models whenever a
 * request-scoped schoolId is available (see tenant-context.ts). It is a
 * no-op outside a request (seed scripts, public/unauthenticated routes)
 * because the AsyncLocalStorage store is empty or has no schoolId yet.
 */
export const tenantScopingExtension = Prisma.defineExtension({
  name: 'tenant-scoping',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const store = tenantContext.getStore();
        const schoolId = store?.schoolId;

        if (
          schoolId != null &&
          model &&
          TENANT_MODELS.has(model) &&
          SCOPED_READ_WRITE_OPERATIONS.has(operation)
        ) {
          const scopedArgs = args as { where?: Record<string, unknown> };
          scopedArgs.where = { ...(scopedArgs.where ?? {}), schoolId };
        }

        return query(args);
      },
    },
  },
});
