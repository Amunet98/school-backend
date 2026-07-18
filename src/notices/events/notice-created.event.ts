export const NOTICE_CREATED_EVENT = 'notices.notice_created';

export class NoticeCreatedEvent {
  constructor(
    public readonly schoolId: bigint,
    public readonly noticeId: bigint,
  ) {}
}
