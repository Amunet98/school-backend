import { Injectable } from '@nestjs/common';
import { Prisma, type SmsMessage } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { SEND_SMS_MAX_ATTEMPTS } from './sms.constants';
import { SmsPurpose } from './sms-gateway.interface';

export interface EnqueueSmsParams {
  schoolId: bigint;
  phone: string;
  body: string;
  purpose: SmsPurpose;
  /**
   * Optional idempotency key (unique index on sms_messages.dedup_key).
   * Absence alerts pass `absence:<enrollmentId>:<YYYY-MM-DD>`; other
   * purposes (otp, notice, fee_reminder) omit it.
   */
  dedupKey?: string;
}

/**
 * Owns sms_messages persistence + the queued->sent/failed status
 * lifecycle (moved out of the gateway, which is delivery-only — see
 * sms-gateway.interface.ts). `enqueue` inserts the row and schedules the
 * `send_sms` graphile-worker job atomically in one DB transaction so the
 * two can never diverge (row without a job, or vice versa).
 */
@Injectable()
export class SmsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the created row, or `null` if `dedupKey` collided with an
   * already-queued/sent message (unique-violation on dedup_key) — that's
   * treated as "already handled", not an error.
   */
  async enqueue(params: EnqueueSmsParams): Promise<SmsMessage | null> {
    const { schoolId, phone, body, purpose, dedupKey } = params;

    return this.prisma.$transaction(async (tx) => {
      let row: SmsMessage;
      try {
        row = await tx.smsMessage.create({
          data: {
            schoolId,
            phone,
            body,
            purpose,
            status: 'queued',
            dedupKey: dedupKey ?? null,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // Unique violation on dedup_key: a message for this key is
          // already queued or sent. Silently treat as already-handled.
          return null;
        }
        throw err;
      }

      const jobPayload = JSON.stringify({ smsMessageId: row.id.toString() });
      await tx.$queryRaw`SELECT graphile_worker.add_job('send_sms', ${jobPayload}::json, max_attempts => ${SEND_SMS_MAX_ATTEMPTS})`;

      return row;
    });
  }
}
