import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantScopingExtension } from './tenant.extension';

/**
 * Wraps PrismaClient with the tenant-scoping extension (see
 * tenant.extension.ts). Returning `this.$extends(...)` from the
 * constructor is Prisma's documented pattern for combining a NestJS
 * lifecycle-managed service with client extensions: the returned object
 * still exposes this class's own methods/lifecycle hooks alongside every
 * extended model delegate (student, teacher, ...).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
    return this.$extends(tenantScopingExtension) as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
