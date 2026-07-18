import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  isSmsEnabled,
  noticeAlert,
  resolveLocale,
} from '../../sms/sms-templates';
import { SmsService } from '../../sms/sms.service';
import {
  NOTICE_CREATED_EVENT,
  NoticeCreatedEvent,
} from '../events/notice-created.event';
import { NoticesService } from '../notices.service';

/**
 * Consumes notice-created events (emitted only when `send_sms: true`) and
 * fans the notice out as an SMS to every targeted student's primary
 * guardian. Mirrors AbsenceListener: fully decoupled from the POST via
 * the fire-and-forget `EventEmitter2` event, whole handler wrapped in
 * try/catch so an SMS failure can never break notice creation, and each
 * per-recipient enqueue is individually try/caught so one bad phone
 * number can't stop the rest of the fan-out.
 *
 * Sync loop over recipients is fine at pilot scale (a few hundred
 * guardians, off the request path already since this runs from the
 * event, not the controller). Future hardening: a single
 * "expand-recipients" graphile-worker job instead of one enqueue call
 * per guardian in-process — not built this milestone.
 */
@Injectable()
export class NoticeSmsListener {
  private readonly logger = new Logger(NoticeSmsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly noticesService: NoticesService,
  ) {}

  @OnEvent(NOTICE_CREATED_EVENT)
  async handleNoticeCreated(event: NoticeCreatedEvent): Promise<void> {
    try {
      const school = await this.prisma.school.findUnique({
        where: { id: event.schoolId },
      });
      if (!school) {
        this.logger.warn(
          `School ${event.schoolId} not found, skipping notice SMS`,
        );
        return;
      }

      if (!isSmsEnabled(school.settings)) {
        this.logger.log(
          `SMS disabled for school ${event.schoolId} (settings.sms_enabled=false), skipping notice SMS`,
        );
        return;
      }

      // Re-read the row rather than trusting event payload beyond the id —
      // the event is emitted only after notice.create resolves, so this
      // is always present.
      const notice = await this.prisma.notice.findUnique({
        where: { id: event.noticeId },
      });
      if (!notice) {
        this.logger.warn(
          `Notice ${event.noticeId} not found, skipping notice SMS`,
        );
        return;
      }

      const phones = await this.noticesService.resolveRecipientPhones(
        event.schoolId,
        notice,
      );
      if (phones.length === 0) {
        this.logger.log(
          `No recipients for notice ${event.noticeId}, skipping notice SMS`,
        );
        return;
      }

      const locale = resolveLocale(school.settings);
      const body = noticeAlert(locale, {
        schoolName: school.name,
        title: notice.title,
      });

      for (const phone of phones) {
        try {
          const dedupKey = `notice:${notice.id}:${phone}`;
          const row = await this.sms.enqueue({
            schoolId: event.schoolId,
            phone,
            body,
            purpose: 'notice',
            dedupKey,
          });
          if (row) {
            this.logger.log(
              `Queued notice SMS for notice ${notice.id} -> ${phone} (sms_messages.id=${row.id})`,
            );
          } else {
            this.logger.log(
              `Notice SMS for notice ${notice.id} -> ${phone} already queued/sent (dedup)`,
            );
          }
        } catch (err) {
          this.logger.error(
            `Notice SMS enqueue failed for notice ${notice.id} -> ${phone}`,
            err as Error,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Notice SMS fan-out failed for notice ${event.noticeId}`,
        err as Error,
      );
    }
  }
}
