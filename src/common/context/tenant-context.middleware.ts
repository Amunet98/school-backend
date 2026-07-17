import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { emptyTenantStore, tenantContext } from './tenant-context';

/**
 * Opens the AsyncLocalStorage scope for the whole request before routing
 * (guards, interceptors, controller, services) runs. JwtAuthGuard populates
 * the store once it verifies the token; until then it stays empty, so the
 * Prisma tenant extension no-ops for public routes.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction) {
    tenantContext.run(emptyTenantStore(), () => next());
  }
}
