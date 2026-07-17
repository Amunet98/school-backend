import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(schoolId: bigint) {
    return this.prisma.teacher.findMany({
      where: { schoolId, deletedAt: null },
    });
  }

  /**
   * Creates a teacher record. If a user with this phone already exists in
   * the school (e.g. they were seeded as a guardian first), the teacher
   * role is attached to that SAME user rather than creating a duplicate
   * login — this is the "one login, two roles" case from the design doc.
   */
  async create(schoolId: bigint, dto: CreateTeacherDto) {
    return this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findFirst({
        where: { schoolId, phone: dto.phone },
      });

      if (!user) {
        const passwordHash = await argon2.hash(dto.password ?? 'changeme123');
        user = await tx.user.create({
          data: { schoolId, phone: dto.phone, passwordHash },
        });
      }

      await tx.userRoleAssignment.upsert({
        where: { userId_role: { userId: user.id, role: 'teacher' } },
        create: { userId: user.id, role: 'teacher' },
        update: {},
      });

      return tx.teacher.create({
        data: {
          schoolId,
          userId: user.id,
          fullName: dto.full_name,
          phone: dto.phone,
        },
      });
    });
  }
}
