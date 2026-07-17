import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';

@Injectable()
export class AcademicYearsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(schoolId: bigint) {
    return this.prisma.academicYear.findMany({
      where: { schoolId },
      orderBy: { startDate: 'desc' },
    });
  }

  /** Single is_current per school, enforced here (schema has no partial unique index for it). */
  async create(schoolId: bigint, dto: CreateAcademicYearDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.is_current) {
        await tx.academicYear.updateMany({
          where: { schoolId, isCurrent: true },
          data: { isCurrent: false },
        });
      }
      return tx.academicYear.create({
        data: {
          schoolId,
          name: dto.name,
          startDate: new Date(dto.start_date),
          endDate: new Date(dto.end_date),
          isCurrent: dto.is_current ?? false,
        },
      });
    });
  }
}
