import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { toBs } from '../common/date/bs-date.util';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  AbsenceMarkedEvent,
  ABSENCE_MARKED_EVENT,
} from './events/absence-marked.event';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';

function toDateOnly(isoDateString: string): Date {
  // Normalize to a UTC midnight Date so the ::date cast in raw SQL and
  // Prisma's @db.Date fields agree regardless of server timezone.
  const [y, m, d] = isoDateString.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async getMySections(schoolId: bigint, userId: bigint) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId, userId },
    });
    if (!teacher) return [];

    return this.prisma.section.findMany({
      where: { schoolId, classTeacherId: teacher.id },
      include: { class: true },
    });
  }

  async getSectionStudents(
    schoolId: bigint,
    sectionId: bigint,
    dateStr: string,
  ) {
    if (!dateStr)
      throw new BadRequestException(
        'date query param is required (YYYY-MM-DD)',
      );

    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, schoolId },
    });
    if (!section) throw new NotFoundException('Section not found');

    const date = toDateOnly(dateStr);

    const enrollments = await this.prisma.enrollment.findMany({
      where: { schoolId, sectionId, status: 'active', deletedAt: null },
      include: {
        student: true,
        attendanceRecords: { where: { date } },
      },
      orderBy: { rollNo: 'asc' },
    });

    return {
      date: dateStr,
      date_bs: toBs(date),
      students: enrollments.map((e) => ({
        enrollment_id: e.id.toString(),
        student_id: e.studentId.toString(),
        full_name: e.student.fullName,
        roll_no: e.rollNo,
        status: e.attendanceRecords[0]?.status ?? null,
      })),
    };
  }

  private async assertOwnsSectionAsClassTeacher(
    schoolId: bigint,
    userId: bigint,
    sectionId: bigint,
  ) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId, userId },
    });
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, schoolId },
    });
    if (!section) throw new NotFoundException('Section not found');
    if (!teacher || section.classTeacherId !== teacher.id) {
      throw new ForbiddenException(
        'You are not the class teacher for this section',
      );
    }
    return section;
  }

  async markAttendance(
    schoolId: bigint,
    sectionId: bigint,
    userId: bigint,
    dto: MarkAttendanceDto,
  ) {
    await this.assertOwnsSectionAsClassTeacher(schoolId, userId, sectionId);

    const enrollmentIds = dto.records.map((r) => BigInt(r.enrollment_id));
    const validEnrollments = await this.prisma.enrollment.findMany({
      where: {
        id: { in: enrollmentIds },
        sectionId,
        schoolId,
        status: 'active',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (validEnrollments.length !== dto.records.length) {
      throw new BadRequestException(
        'One or more enrollment_id values do not belong to this section/school',
      );
    }

    const marker = await this.prisma.user.findFirst({
      where: { id: userId, schoolId },
    });
    if (!marker)
      throw new ForbiddenException('Marker not found in this school');

    const date = toDateOnly(dto.date);

    const values = dto.records.map(
      (r) =>
        Prisma.sql`(${schoolId}, ${BigInt(r.enrollment_id)}, ${date}::date, ${r.status}::attendance_status, ${userId}, now())`,
    );

    await this.prisma.$executeRaw`
      INSERT INTO attendance_records (school_id, enrollment_id, date, status, marked_by, marked_at)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (enrollment_id, date)
      DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = EXCLUDED.marked_at
    `;

    for (const r of dto.records) {
      if (
        r.status === 'absent' ||
        r.status === 'late' ||
        r.status === 'leave'
      ) {
        this.events.emit(
          ABSENCE_MARKED_EVENT,
          new AbsenceMarkedEvent(
            schoolId,
            BigInt(r.enrollment_id),
            date,
            r.status,
            userId,
          ),
        );
      }
    }

    return this.getSectionStudents(schoolId, sectionId, dto.date);
  }

  async getMyChildren(schoolId: bigint, userId: bigint) {
    const guardian = await this.prisma.guardian.findFirst({
      where: { schoolId, userId },
    });
    if (!guardian) return [];

    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId: guardian.id },
      include: {
        student: {
          include: {
            enrollments: {
              where: { status: 'active', deletedAt: null },
              include: { section: { include: { class: true } } },
            },
          },
        },
      },
    });

    return links
      .filter(
        (l) => l.student.schoolId === schoolId && l.student.deletedAt === null,
      )
      .map((l) => ({
        student_id: l.student.id.toString(),
        full_name: l.student.fullName,
        is_primary: l.isPrimary,
        current_enrollment: l.student.enrollments[0]
          ? {
              section: l.student.enrollments[0].section.name,
              class: l.student.enrollments[0].section.class.name,
              roll_no: l.student.enrollments[0].rollNo,
            }
          : null,
      }));
  }

  async getChildAttendance(
    schoolId: bigint,
    userId: bigint,
    studentId: bigint,
    month: string,
  ) {
    const guardian = await this.prisma.guardian.findFirst({
      where: { schoolId, userId },
    });
    if (!guardian) throw new ForbiddenException('Not a guardian');

    const link = await this.prisma.studentGuardian.findFirst({
      where: { guardianId: guardian.id, studentId },
    });
    if (!link)
      throw new ForbiddenException(
        'This student is not linked to your account',
      );

    // month = "YYYY-MM" (AD)
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthNum = Number(monthStr);
    const rangeStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const rangeEnd = new Date(Date.UTC(year, monthNum, 1));

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        schoolId,
        date: { gte: rangeStart, lt: rangeEnd },
        enrollment: { studentId },
      },
      orderBy: { date: 'asc' },
    });

    return records.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      date_bs: toBs(r.date),
      status: r.status,
    }));
  }
}
