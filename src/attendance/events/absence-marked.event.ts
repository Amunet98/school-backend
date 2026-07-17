export const ABSENCE_MARKED_EVENT = 'attendance.absence_marked';

export class AbsenceMarkedEvent {
  constructor(
    public readonly schoolId: bigint,
    public readonly enrollmentId: bigint,
    public readonly date: Date,
    public readonly status: 'absent' | 'late' | 'leave',
    public readonly markedBy: bigint,
  ) {}
}
