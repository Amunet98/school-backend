import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ABSENCE_MARKED_EVENT,
  AbsenceMarkedEvent,
} from '../events/absence-marked.event';

/**
 * Placeholder consumer for absence events. The SMS milestone will attach a
 * real notifier here (parent SMS via SmsGateway); for now this just logs,
 * proving the event wiring works end-to-end without coupling attendance
 * marking to SMS delivery.
 */
@Injectable()
export class AbsenceListener {
  private readonly logger = new Logger(AbsenceListener.name);

  @OnEvent(ABSENCE_MARKED_EVENT)
  handleAbsence(event: AbsenceMarkedEvent) {
    this.logger.log(
      `Enrollment ${event.enrollmentId} marked ${event.status} on ${event.date.toISOString().slice(0, 10)} (school ${event.schoolId})`,
    );
  }
}
