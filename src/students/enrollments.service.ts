import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PromoteDto } from './dto/promote.dto';

export interface PromoteResult {
  promoted: number;
  skipped: { student_id: string; reason: string }[];
}

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bulk-promote every active enrollment in from_section_id into a new
   * enrollment row in to_section_id/to_academic_year_id. Old enrollment
   * rows are left untouched so history (and past attendance) survives.
   */
  async promote(schoolId: bigint, dto: PromoteDto): Promise<PromoteResult> {
    const [fromSection, toSection, toYear] = await Promise.all([
      this.prisma.section.findFirst({
        where: { id: BigInt(dto.from_section_id), schoolId },
      }),
      this.prisma.section.findFirst({
        where: { id: BigInt(dto.to_section_id), schoolId },
      }),
      this.prisma.academicYear.findFirst({
        where: { id: BigInt(dto.to_academic_year_id), schoolId },
      }),
    ]);
    if (!fromSection)
      throw new BadRequestException(
        'from_section_id does not belong to this school',
      );
    if (!toSection)
      throw new BadRequestException(
        'to_section_id does not belong to this school',
      );
    if (!toYear)
      throw new BadRequestException(
        'to_academic_year_id does not belong to this school',
      );

    const activeEnrollments = await this.prisma.enrollment.findMany({
      where: {
        schoolId,
        sectionId: BigInt(dto.from_section_id),
        status: 'active',
        deletedAt: null,
      },
    });

    const result: PromoteResult = { promoted: 0, skipped: [] };

    for (const enrollment of activeEnrollments) {
      const existing = await this.prisma.enrollment.findUnique({
        where: {
          studentId_academicYearId: {
            studentId: enrollment.studentId,
            academicYearId: BigInt(dto.to_academic_year_id),
          },
        },
      });
      if (existing) {
        result.skipped.push({
          student_id: enrollment.studentId.toString(),
          reason: 'Already enrolled in target academic year',
        });
        continue;
      }

      await this.prisma.enrollment.create({
        data: {
          schoolId,
          studentId: enrollment.studentId,
          academicYearId: BigInt(dto.to_academic_year_id),
          sectionId: BigInt(dto.to_section_id),
          rollNo: enrollment.rollNo,
        },
      });
      result.promoted += 1;
    }

    return result;
  }
}
