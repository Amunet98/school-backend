import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ImportResult, StudentCsvRow } from './csv-row.dto';

@Injectable()
export class StudentsImportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CSV columns: full_name, dob, gender, class_name, section_name, roll_no,
   * guardian_full_name, guardian_phone, guardian_relation.
   *
   * Each row is created in its own transaction (student + guardian +
   * enrollment) so a bad row is skipped and reported without leaving
   * partial writes, while good rows in the same file still commit.
   */
  async importCsv(
    schoolId: bigint,
    academicYearId: bigint,
    fileBuffer: Buffer,
  ): Promise<ImportResult> {
    const rows: StudentCsvRow[] = parse(fileBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const result: ImportResult = { created: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2; // +1 for header row, +1 for 1-based
      const row = rows[i];
      try {
        await this.importRow(schoolId, academicYearId, row);
        result.created += 1;
      } catch (err) {
        result.errors.push({
          row: rowNumber,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  private async importRow(
    schoolId: bigint,
    academicYearId: bigint,
    row: StudentCsvRow,
  ) {
    if (!row.full_name?.trim()) {
      throw new Error('full_name is required');
    }
    if (!row.class_name?.trim() || !row.section_name?.trim()) {
      throw new Error('class_name and section_name are required');
    }

    await this.prisma.$transaction(async (tx) => {
      const klass = await tx.class.findFirst({
        where: { schoolId, name: row.class_name!.trim() },
      });
      if (!klass) {
        throw new Error(`Class "${row.class_name}" not found`);
      }
      const section = await tx.section.findFirst({
        where: { schoolId, classId: klass.id, name: row.section_name!.trim() },
      });
      if (!section) {
        throw new Error(
          `Section "${row.section_name}" not found in class "${row.class_name}"`,
        );
      }

      const student = await tx.student.create({
        data: {
          schoolId,
          fullName: row.full_name!.trim(),
          dob: row.dob ? new Date(row.dob) : undefined,
          gender: row.gender?.trim() || undefined,
        },
      });

      if (row.guardian_full_name?.trim() && row.guardian_phone?.trim()) {
        let guardian = await tx.guardian.findFirst({
          where: { schoolId, phone: row.guardian_phone.trim() },
        });
        if (!guardian) {
          guardian = await tx.guardian.create({
            data: {
              schoolId,
              fullName: row.guardian_full_name.trim(),
              phone: row.guardian_phone.trim(),
              relation: row.guardian_relation?.trim() || undefined,
            },
          });
        }
        await tx.studentGuardian.create({
          data: {
            studentId: student.id,
            guardianId: guardian.id,
            isPrimary: true,
          },
        });
      }

      const rollNo = row.roll_no ? Number.parseInt(row.roll_no, 10) : undefined;
      await tx.enrollment.create({
        data: {
          schoolId,
          studentId: student.id,
          academicYearId,
          sectionId: section.id,
          rollNo: Number.isFinite(rollNo) ? rollNo : undefined,
        },
      });
    });
  }
}
