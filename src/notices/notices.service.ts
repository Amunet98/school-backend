import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateNoticeDto,
  CreateTeacherNoticeDto,
} from './dto/create-notice.dto';
import {
  NOTICE_CREATED_EVENT,
  NoticeCreatedEvent,
} from './events/notice-created.event';

const NOTICE_INCLUDE = {
  class: true,
  section: { include: { class: true } },
} as const;

@Injectable()
export class NoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  findAll(schoolId: bigint) {
    return this.prisma.notice.findMany({
      where: { schoolId },
      include: NOTICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(schoolId: bigint, userId: bigint, dto: CreateNoticeDto) {
    // ValidateIf only validates conditionally-required fields when the
    // audience matches — it can't reject a *stray* id sent alongside the
    // wrong audience, so that rejection lives here.
    if (dto.audience !== 'class' && dto.class_id !== undefined) {
      throw new BadRequestException(
        'class_id may only be sent when audience is "class"',
      );
    }
    if (dto.audience !== 'section' && dto.section_id !== undefined) {
      throw new BadRequestException(
        'section_id may only be sent when audience is "section"',
      );
    }

    let classId: bigint | null = null;
    let sectionId: bigint | null = null;

    if (dto.audience === 'class') {
      const cls = await this.prisma.class.findFirst({
        where: { id: BigInt(dto.class_id!), schoolId },
      });
      if (!cls) throw new NotFoundException('Class not found');
      classId = cls.id;
    } else if (dto.audience === 'section') {
      const section = await this.prisma.section.findFirst({
        where: { id: BigInt(dto.section_id!), schoolId },
      });
      if (!section) throw new NotFoundException('Section not found');
      sectionId = section.id;
    }

    const notice = await this.prisma.notice.create({
      data: {
        schoolId,
        title: dto.title,
        body: dto.body,
        audience: dto.audience,
        classId,
        sectionId,
        sendSms: dto.send_sms ?? false,
        createdBy: userId,
      },
      include: NOTICE_INCLUDE,
    });

    if (notice.sendSms) {
      this.events.emit(
        NOTICE_CREATED_EVENT,
        new NoticeCreatedEvent(schoolId, notice.id),
      );
    }

    return notice;
  }

  private async getMySections(schoolId: bigint, userId: bigint) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId, userId },
    });
    if (!teacher) return [];

    return this.prisma.section.findMany({
      where: { schoolId, classTeacherId: teacher.id },
      include: { class: true },
    });
  }

  /**
   * Copied from AttendanceService.assertOwnsSectionAsClassTeacher
   * (attendance.service.ts:82-100) rather than cross-imported — the two
   * modules stay decoupled. 404 for a section that doesn't belong to the
   * caller's school (or doesn't exist), 403 for a section that does but
   * isn't the caller's.
   */
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

  async findMyNotices(schoolId: bigint, userId: bigint) {
    const sections = await this.getMySections(schoolId, userId);
    const classIds = [...new Set(sections.map((s) => s.classId))];
    const sectionIds = sections.map((s) => s.id);

    return this.prisma.notice.findMany({
      where: {
        schoolId,
        OR: [
          { audience: 'school' },
          ...(classIds.length
            ? [{ audience: 'class', classId: { in: classIds } }]
            : []),
          ...(sectionIds.length
            ? [{ audience: 'section', sectionId: { in: sectionIds } }]
            : []),
        ],
      },
      include: NOTICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Same shape as getMySections above, scoped by the guardian's children's
   * active enrollments instead of sections taught.
   */
  private async getMyChildrenSections(schoolId: bigint, userId: bigint) {
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
              include: { section: true },
            },
          },
        },
      },
    });

    return links
      .filter(
        (l) => l.student.schoolId === schoolId && l.student.deletedAt === null,
      )
      .flatMap((l) => l.student.enrollments.map((e) => e.section));
  }

  async findNoticesForGuardian(schoolId: bigint, userId: bigint) {
    const sections = await this.getMyChildrenSections(schoolId, userId);
    const classIds = [...new Set(sections.map((s) => s.classId))];
    const sectionIds = [...new Set(sections.map((s) => s.id))];

    return this.prisma.notice.findMany({
      where: {
        schoolId,
        OR: [
          { audience: 'school' },
          ...(classIds.length
            ? [{ audience: 'class', classId: { in: classIds } }]
            : []),
          ...(sectionIds.length
            ? [{ audience: 'section', sectionId: { in: sectionIds } }]
            : []),
        ],
      },
      include: NOTICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createMyNotice(
    schoolId: bigint,
    userId: bigint,
    dto: CreateTeacherNoticeDto,
  ) {
    const sectionId = BigInt(dto.section_id);
    await this.assertOwnsSectionAsClassTeacher(schoolId, userId, sectionId);

    const notice = await this.prisma.notice.create({
      data: {
        schoolId,
        title: dto.title,
        body: dto.body,
        audience: 'section',
        classId: null,
        sectionId,
        sendSms: dto.send_sms ?? false,
        createdBy: userId,
      },
      include: NOTICE_INCLUDE,
    });

    if (notice.sendSms) {
      this.events.emit(
        NOTICE_CREATED_EVENT,
        new NoticeCreatedEvent(schoolId, notice.id),
      );
    }

    return notice;
  }

  /**
   * Public + unit-testable: resolves the deduplicated set of primary
   * guardian phone numbers for a notice's audience, scoped to the current
   * academic year's active enrollments. Used by NoticeSmsListener.
   */
  async resolveRecipientPhones(
    schoolId: bigint,
    notice: {
      audience: string;
      classId: bigint | null;
      sectionId: bigint | null;
    },
  ): Promise<string[]> {
    const currentYear = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
    });
    if (!currentYear) return [];

    const audienceScope =
      notice.audience === 'class'
        ? { section: { classId: notice.classId! } }
        : notice.audience === 'section'
          ? { sectionId: notice.sectionId! }
          : {};

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        schoolId,
        academicYearId: currentYear.id,
        status: 'active',
        deletedAt: null,
        student: { deletedAt: null },
        ...audienceScope,
      },
      include: {
        student: {
          include: { guardians: { include: { guardian: true } } },
        },
      },
    });

    const phones = new Set<string>();
    for (const enrollment of enrollments) {
      const guardians = enrollment.student.guardians;
      const guardianLink = guardians.find((g) => g.isPrimary) ?? guardians[0];
      if (!guardianLink) continue;
      phones.add(guardianLink.guardian.phone);
    }

    return [...phones];
  }
}
