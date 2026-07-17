/**
 * Max attempts for the `send_sms` graphile-worker task before
 * `sms_messages.status` is marked 'failed' and the job stops retrying.
 * Shared between `SmsService` (schedules the job with this cap) and
 * `SmsQueueService` (compares it against the job's current attempt count).
 */
export const SEND_SMS_MAX_ATTEMPTS = 5;
