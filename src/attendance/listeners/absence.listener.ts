import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { toBs } from '../../common/date/bs-date.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  absenceAlert,
  isSmsEnabled,
  resolveLocale,
} from '../../sms/sms-templates';
import { SmsService } from '../../sms/sms.service';
import {
  ABSENCE_MARKED_EVENT,
  AbsenceMarkedEvent,
} from '../events/absence-marked.event';

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD, matches the UTC-midnight-normalized Date attendance.service.ts stores
}

/**
 * Consumes absence-marked events and sends a guardian SMS for `absent`
 * only (late/leave stay app-only, per the SMS milestone's scope decision).
 * Deliberately decoupled from the attendance POST: it runs off the
 * `EventEmitter2` fire-and-forget event, and every failure path here is
 * caught and logged rather than allowed to propagate — an SMS problem
 * must never affect attendance marking.
 *
 * Known accepted edge case: absent -> corrected to present -> re-marked
 * absent the same day sends only the first SMS, because the dedup key
 * (`absence:<enrollmentId>:<date>`) is the same for both and the second
 * enqueue silently no-ops on the unique-index collision.
 */
@Injectable()
export class AbsenceListener {
  private readonly logger = new Logger(AbsenceListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  @OnEvent(ABSENCE_MARKED_EVENT)
  async handleAbsence(event: AbsenceMarkedEvent): Promise<void> {
    if (event.status !== 'absent') {
      this.logger.log(
        `Enrollment ${event.enrollmentId} marked ${event.status} on ${dateKey(event.date)} (school ${event.schoolId}) — no SMS for late/leave`,
      );
      return;
    }

    try {
      const school = await this.prisma.school.findUnique({
        where: { id: event.schoolId },
      });
      if (!school) {
        this.logger.warn(
          `School ${event.schoolId} not found, skipping absence SMS`,
        );
        return;
      }

      if (!isSmsEnabled(school.settings)) {
        this.logger.log(
          `SMS disabled for school ${event.schoolId} (settings.sms_enabled=false), skipping absence SMS`,
        );
        return;
      }

      const enrollment = await this.prisma.enrollment.findUnique({
        where: { id: event.enrollmentId },
        include: {
          student: {
            include: { guardians: { include: { guardian: true } } },
          },
        },
      });
      if (!enrollment) {
        this.logger.warn(
          `Enrollment ${event.enrollmentId} not found, skipping absence SMS`,
        );
        return;
      }

      const guardianLink =
        enrollment.student.guardians.find((g) => g.isPrimary) ??
        enrollment.student.guardians[0];
      if (!guardianLink) {
        this.logger.log(
          `No guardian on file for student ${enrollment.studentId}, skipping absence SMS`,
        );
        return;
      }

      const locale = resolveLocale(school.settings);
      const body = absenceAlert(locale, {
        studentName: enrollment.student.fullName,
        schoolName: school.name,
        dateBs: toBs(event.date),
      });
      const dedupKey = `absence:${event.enrollmentId}:${dateKey(event.date)}`;

      const row = await this.sms.enqueue({
        schoolId: event.schoolId,
        phone: guardianLink.guardian.phone,
        body,
        purpose: 'absence',
        dedupKey,
      });

      if (row) {
        this.logger.log(
          `Queued absence SMS for enrollment ${event.enrollmentId} (sms_messages.id=${row.id})`,
        );
      } else {
        this.logger.log(
          `Absence SMS for enrollment ${event.enrollmentId} on ${dateKey(event.date)} already queued/sent (dedup)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Absence SMS failed for enrollment ${event.enrollmentId}`,
        err as Error,
      );
    }
  }
}
