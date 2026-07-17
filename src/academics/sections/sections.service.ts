import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateSectionDto } from './dto/create-section.dto';

@Injectable()
export class SectionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(schoolId: bigint, classId?: number) {
    return this.prisma.section.findMany({
      where: {
        schoolId,
        ...(classId ? { classId: BigInt(classId) } : {}),
      },
      include: { class: true, classTeacher: true },
    });
  }

  async create(schoolId: bigint, dto: CreateSectionDto) {
    const klass = await this.prisma.class.findFirst({
      where: { id: BigInt(dto.class_id), schoolId },
    });
    if (!klass) {
      throw new BadRequestException('class_id does not belong to this school');
    }

    if (dto.class_teacher_id) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { id: BigInt(dto.class_teacher_id), schoolId },
      });
      if (!teacher) {
        throw new BadRequestException('class_teacher_id does not belong to this school');
      }
    }

    return this.prisma.section.create({
      data: {
        schoolId,
        classId: BigInt(dto.class_id),
        name: dto.name,
        classTeacherId: dto.class_teacher_id ? BigInt(dto.class_teacher_id) : undefined,
      },
    });
  }

  async findOneOrThrow(schoolId: bigint, sectionId: bigint) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, schoolId },
    });
    if (!section) {
      throw new NotFoundException('Section not found');
    }
    return section;
  }
}
