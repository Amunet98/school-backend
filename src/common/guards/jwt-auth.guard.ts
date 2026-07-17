import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { tenantContext } from '../context/tenant-context';
import type { AuthenticatedUser } from '../interfaces/jwt-payload.interface';

type RequestWithUser = Request & { user?: AuthenticatedUser };

/**
 * Global guard. Routes are protected by default; annotate with @Public()
 * to skip auth (login, refresh, OTP). On success, also mirrors the
 * verified user into the request-scoped AsyncLocalStorage store so the
 * Prisma tenant-scoping extension can see it.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const activated = (await super.canActivate(context)) as boolean;
    if (!activated) {
      return false;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    const store = tenantContext.getStore();
    if (store && user) {
      store.userId = user.userId;
      store.schoolId = user.schoolId;
      store.roles = user.roles;
    }

    return true;
  }
}
