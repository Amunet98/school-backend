import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(schoolId: bigint) {
    return this.prisma.class.findMany({
      where: { schoolId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  create(schoolId: bigint, dto: CreateClassDto) {
    return this.prisma.class.create({
      data: {
        schoolId,
        name: dto.name,
        sortOrder: dto.sort_order ?? 0,
      },
    });
  }
}
