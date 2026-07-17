import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { run, type JobHelpers, type Runner } from 'graphile-worker';
import { PrismaService } from '../common/prisma/prisma.service';
import { SMS_GATEWAY, type SmsGateway } from './sms-gateway.interface';

/**
 * Embedded graphile-worker runner: starts a Postgres-based job queue
 * inside this same API process (no separate worker process, no Redis —
 * graphile-worker manages its own `graphile_worker` schema in the same
 * database via DATABASE_URL). `SmsService.enqueue` inserts sms_messages
 * rows and schedules `send_sms` jobs atomically in one transaction; this
 * class only registers/runs the task handler and owns the runner's
 * lifecycle.
 */
@Injectable()
export class SmsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmsQueueService.name);
  private runner: Runner | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(SMS_GATEWAY) private readonly smsGateway: SmsGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    this.runner = await run({
      connectionString: this.config.get<string>('DATABASE_URL'),
      concurrency: 2,
      // Nest already owns process signal handling / graceful shutdown;
      // we stop the runner explicitly from onModuleDestroy instead of
      // letting graphile-worker install its own SIGTERM/SIGINT handlers.
      noHandleSignals: true,
      taskList: {
        send_sms: (payload, helpers) => this.sendSms(payload, helpers),
      },
    });
    this.logger.log('graphile-worker started (embedded, concurrency=2)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.runner?.stop();
  }

  private async sendSms(payload: unknown, helpers: JobHelpers): Promise<void> {
    const { smsMessageId } = payload as { smsMessageId: string };
    const id = BigInt(smsMessageId);

    const row = await this.prisma.smsMessage.findUnique({ where: { id } });
    if (!row) {
      helpers.logger.warn(`sms_messages row ${id} not found, skipping`);
      return;
    }
    if (row.status === 'sent') {
      // Already delivered (e.g. a retried job that actually succeeded
      // before a crash prevented status update from committing) — no-op.
      return;
    }

    try {
      const { gatewayRef } = await this.smsGateway.deliver(row.phone, row.body);
      await this.prisma.smsMessage.update({
        where: { id },
        data: { status: 'sent', gatewayRef: gatewayRef ?? null },
      });
    } catch (err) {
      if (helpers.job.attempts >= helpers.job.max_attempts) {
        helpers.logger.error(
          `send_sms giving up for sms_messages.id=${id} after ${helpers.job.attempts} attempts`,
        );
        await this.prisma.smsMessage.update({
          where: { id },
          data: { status: 'failed' },
        });
        return; // swallow — graphile-worker won't retry further from here
      }
      throw err; // let graphile-worker retry with exponential backoff
    }
  }
}
