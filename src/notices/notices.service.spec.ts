import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { NoticesService } from './notices.service';
import { NOTICE_CREATED_EVENT } from './events/notice-created.event';
import {
  CreateNoticeDto,
  CreateTeacherNoticeDto,
} from './dto/create-notice.dto';

describe('NoticesService', () => {
  let service: NoticesService;
  let prisma: {
    class: { findFirst: jest.Mock };
    section: { findFirst: jest.Mock };
    notice: {
      create: jest.Mock<unknown, [{ data: Record<string, unknown> }]>;
      findMany: jest.Mock;
    };
    teacher: { findFirst: jest.Mock };
    academicYear: { findFirst: jest.Mock };
    enrollment: { findMany: jest.Mock };
    guardian: { findFirst: jest.Mock };
    studentGuardian: { findMany: jest.Mock };
  };
  let emit: jest.Mock;

  beforeEach(async () => {
    prisma = {
      class: { findFirst: jest.fn() },
      section: { findFirst: jest.fn() },
      notice: {
        create: jest.fn<unknown, [{ data: Record<string, unknown> }]>(),
        findMany: jest.fn(),
      },
      teacher: { findFirst: jest.fn() },
      academicYear: { findFirst: jest.fn() },
      enrollment: { findMany: jest.fn() },
      guardian: { findFirst: jest.fn() },
      studentGuardian: { findMany: jest.fn() },
    };
    emit = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoticesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit } },
      ],
    }).compile();

    service = module.get(NoticesService);
  });

  const SCHOOL_ID = 1n;
  const USER_ID = 10n;

  describe('create (admin)', () => {
    it('400s when class_id is sent with a non-class audience', async () => {
      const dto: CreateNoticeDto = {
        title: 't',
        body: 'b',
        audience: 'school',
        class_id: 5,
      };
      await expect(service.create(SCHOOL_ID, USER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.notice.create).not.toHaveBeenCalled();
    });

    it('400s when section_id is sent with a non-section audience', async () => {
      const dto: CreateNoticeDto = {
        title: 't',
        body: 'b',
        audience: 'class',
        class_id: 5,
        section_id: 9,
      };
      await expect(service.create(SCHOOL_ID, USER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.notice.create).not.toHaveBeenCalled();
    });

    it('404s when the target class does not belong to (or exist in) the school', async () => {
      prisma.class.findFirst.mockResolvedValue(null);
      const dto: CreateNoticeDto = {
        title: 't',
        body: 'b',
        audience: 'class',
        class_id: 999,
      };
      await expect(service.create(SCHOOL_ID, USER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.notice.create).not.toHaveBeenCalled();
    });

    it('404s when the target section does not belong to (or exist in) the school', async () => {
      prisma.section.findFirst.mockResolvedValue(null);
      const dto: CreateNoticeDto = {
        title: 't',
        body: 'b',
        audience: 'section',
        section_id: 999,
      };
      await expect(service.create(SCHOOL_ID, USER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.notice.create).not.toHaveBeenCalled();
    });

    it('emits NOTICE_CREATED_EVENT when send_sms is true', async () => {
      prisma.notice.create.mockResolvedValue({
        id: 42n,
        sendSms: true,
      });
      const dto: CreateNoticeDto = {
        title: 't',
        body: 'b',
        audience: 'school',
        send_sms: true,
      };
      await service.create(SCHOOL_ID, USER_ID, dto);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith(
        NOTICE_CREATED_EVENT,
        expect.objectContaining({ schoolId: SCHOOL_ID, noticeId: 42n }),
      );
    });

    it('does not emit an event when send_sms is false/omitted', async () => {
      prisma.notice.create.mockResolvedValue({ id: 43n, sendSms: false });
      const dto: CreateNoticeDto = {
        title: 't',
        body: 'b',
        audience: 'school',
      };
      await service.create(SCHOOL_ID, USER_ID, dto);
      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('createMyNotice (teacher)', () => {
    it('404s when the section does not exist in the caller school', async () => {
      prisma.teacher.findFirst.mockResolvedValue({ id: 100n });
      prisma.section.findFirst.mockResolvedValue(null);
      const dto: CreateTeacherNoticeDto = {
        title: 't',
        body: 'b',
        section_id: 5,
      };
      await expect(
        service.createMyNotice(SCHOOL_ID, USER_ID, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('403s when the caller is not the class teacher of an existing section', async () => {
      prisma.teacher.findFirst.mockResolvedValue({ id: 100n });
      prisma.section.findFirst.mockResolvedValue({
        id: 5n,
        classTeacherId: 999n,
      });
      const dto: CreateTeacherNoticeDto = {
        title: 't',
        body: 'b',
        section_id: 5,
      };
      await expect(
        service.createMyNotice(SCHOOL_ID, USER_ID, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forces audience to section and emits only when send_sms is true', async () => {
      prisma.teacher.findFirst.mockResolvedValue({ id: 100n });
      prisma.section.findFirst.mockResolvedValue({
        id: 5n,
        classTeacherId: 100n,
      });
      prisma.notice.create.mockResolvedValue({ id: 44n, sendSms: true });

      const dto: CreateTeacherNoticeDto = {
        title: 't',
        body: 'b',
        section_id: 5,
        send_sms: true,
      };
      await service.createMyNotice(SCHOOL_ID, USER_ID, dto);

      const [createArgs] = prisma.notice.create.mock.calls[0];
      expect(createArgs.data).toMatchObject({
        audience: 'section',
        sectionId: 5n,
        classId: null,
      });
      expect(emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolveRecipientPhones', () => {
    const notice = { audience: 'school', classId: null, sectionId: null };

    it('returns [] when there is no current academic year', async () => {
      prisma.academicYear.findFirst.mockResolvedValue(null);
      const phones = await service.resolveRecipientPhones(SCHOOL_ID, notice);
      expect(phones).toEqual([]);
      expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
    });

    it('prefers the primary guardian phone when one exists', async () => {
      prisma.academicYear.findFirst.mockResolvedValue({ id: 7n });
      prisma.enrollment.findMany.mockResolvedValue([
        {
          student: {
            guardians: [
              { isPrimary: false, guardian: { phone: '9811111111' } },
              { isPrimary: true, guardian: { phone: '9822222222' } },
            ],
          },
        },
      ]);
      const phones = await service.resolveRecipientPhones(SCHOOL_ID, notice);
      expect(phones).toEqual(['9822222222']);
    });

    it('falls back to the first guardian when none is marked primary', async () => {
      prisma.academicYear.findFirst.mockResolvedValue({ id: 7n });
      prisma.enrollment.findMany.mockResolvedValue([
        {
          student: {
            guardians: [
              { isPrimary: false, guardian: { phone: '9811111111' } },
              { isPrimary: false, guardian: { phone: '9822222222' } },
            ],
          },
        },
      ]);
      const phones = await service.resolveRecipientPhones(SCHOOL_ID, notice);
      expect(phones).toEqual(['9811111111']);
    });

    it('skips enrollments with no guardians on file', async () => {
      prisma.academicYear.findFirst.mockResolvedValue({ id: 7n });
      prisma.enrollment.findMany.mockResolvedValue([
        { student: { guardians: [] } },
        {
          student: {
            guardians: [{ isPrimary: true, guardian: { phone: '9833333333' } }],
          },
        },
      ]);
      const phones = await service.resolveRecipientPhones(SCHOOL_ID, notice);
      expect(phones).toEqual(['9833333333']);
    });

    it('dedupes phones across siblings sharing a guardian', async () => {
      prisma.academicYear.findFirst.mockResolvedValue({ id: 7n });
      prisma.enrollment.findMany.mockResolvedValue([
        {
          student: {
            guardians: [{ isPrimary: true, guardian: { phone: '9844444444' } }],
          },
        },
        {
          student: {
            guardians: [{ isPrimary: true, guardian: { phone: '9844444444' } }],
          },
        },
      ]);
      const phones = await service.resolveRecipientPhones(SCHOOL_ID, notice);
      expect(phones).toEqual(['9844444444']);
    });
  });

  describe('findNoticesForGuardian', () => {
    it('scopes to school-wide only when the caller has no guardian record', async () => {
      prisma.guardian.findFirst.mockResolvedValue(null);
      prisma.notice.findMany.mockResolvedValue([]);
      await service.findNoticesForGuardian(SCHOOL_ID, USER_ID);
      expect(prisma.notice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { schoolId: SCHOOL_ID, OR: [{ audience: 'school' }] },
        }),
      );
    });

    it('unions school-wide notices with the class/section of every active child', async () => {
      prisma.guardian.findFirst.mockResolvedValue({ id: 50n });
      prisma.studentGuardian.findMany.mockResolvedValue([
        {
          student: {
            schoolId: SCHOOL_ID,
            deletedAt: null,
            enrollments: [{ section: { id: 5n, classId: 2n } }],
          },
        },
      ]);
      prisma.notice.findMany.mockResolvedValue([{ id: 1n }]);

      const result = await service.findNoticesForGuardian(SCHOOL_ID, USER_ID);

      expect(prisma.notice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            schoolId: SCHOOL_ID,
            OR: [
              { audience: 'school' },
              { audience: 'class', classId: { in: [2n] } },
              { audience: 'section', sectionId: { in: [5n] } },
            ],
          },
        }),
      );
      expect(result).toEqual([{ id: 1n }]);
    });

    it('ignores a sibling enrolled at a different school and a soft-deleted child', async () => {
      prisma.guardian.findFirst.mockResolvedValue({ id: 50n });
      prisma.studentGuardian.findMany.mockResolvedValue([
        {
          student: {
            schoolId: 999n, // different school
            deletedAt: null,
            enrollments: [{ section: { id: 5n, classId: 2n } }],
          },
        },
        {
          student: {
            schoolId: SCHOOL_ID,
            deletedAt: new Date(), // soft-deleted
            enrollments: [{ section: { id: 6n, classId: 3n } }],
          },
        },
      ]);
      prisma.notice.findMany.mockResolvedValue([]);

      await service.findNoticesForGuardian(SCHOOL_ID, USER_ID);

      expect(prisma.notice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            schoolId: SCHOOL_ID,
            OR: [{ audience: 'school' }],
          },
        }),
      );
    });
  });
});
