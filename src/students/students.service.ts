import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(schoolId: bigint, sectionId?: number) {
    return this.prisma.student.findMany({
      where: {
        schoolId,
        deletedAt: null,
        ...(sectionId
          ? {
              enrollments: {
                some: { sectionId: BigInt(sectionId), deletedAt: null },
              },
            }
          : {}),
      },
      include: {
        guardians: { include: { guardian: true } },
        enrollments: { where: { deletedAt: null }, include: { section: true } },
      },
    });
  }

  async findOneOrThrow(schoolId: bigint, studentId: bigint) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      include: {
        guardians: { include: { guardian: true } },
        enrollments: { where: { deletedAt: null }, include: { section: true } },
      },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }

  async create(schoolId: bigint, dto: CreateStudentDto) {
    if (dto.enrollment) {
      await this.assertSectionAndYearBelongToSchool(
        schoolId,
        dto.enrollment.section_id,
        dto.enrollment.academic_year_id,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          schoolId,
          fullName: dto.full_name,
          dob: dto.dob ? new Date(dto.dob) : undefined,
          gender: dto.gender,
          photoUrl: dto.photo_url,
        },
      });

      for (const g of dto.guardians ?? []) {
        let guardian = await tx.guardian.findFirst({
          where: { schoolId, phone: g.phone },
        });
        if (!guardian) {
          guardian = await tx.guardian.create({
            data: {
              schoolId,
              fullName: g.full_name,
              phone: g.phone,
              relation: g.relation,
            },
          });
        }
        await tx.studentGuardian.create({
          data: {
            studentId: student.id,
            guardianId: guardian.id,
            isPrimary: g.is_primary ?? false,
          },
        });
      }

      if (dto.enrollment) {
        await tx.enrollment.create({
          data: {
            schoolId,
            studentId: student.id,
            academicYearId: BigInt(dto.enrollment.academic_year_id),
            sectionId: BigInt(dto.enrollment.section_id),
            rollNo: dto.enrollment.roll_no,
          },
        });
      }

      return tx.student.findUniqueOrThrow({
        where: { id: student.id },
        include: {
          guardians: { include: { guardian: true } },
          enrollments: { include: { section: true } },
        },
      });
    });
  }

  async update(schoolId: bigint, studentId: bigint, dto: UpdateStudentDto) {
    await this.findOneOrThrow(schoolId, studentId);
    return this.prisma.student.update({
      where: { id: studentId },
      data: {
        fullName: dto.full_name,
        dob: dto.dob ? new Date(dto.dob) : undefined,
        gender: dto.gender,
        photoUrl: dto.photo_url,
      },
    });
  }

  async assertSectionAndYearBelongToSchool(
    schoolId: bigint,
    sectionId: number,
    academicYearId: number,
  ) {
    const [section, year] = await Promise.all([
      this.prisma.section.findFirst({
        where: { id: BigInt(sectionId), schoolId },
      }),
      this.prisma.academicYear.findFirst({
        where: { id: BigInt(academicYearId), schoolId },
      }),
    ]);
    if (!section)
      throw new BadRequestException(
        'section_id does not belong to this school',
      );
    if (!year)
      throw new BadRequestException(
        'academic_year_id does not belong to this school',
      );
  }
}
