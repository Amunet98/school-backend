import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { StudentsImportService } from './import/students-import.service';

@Module({
  controllers: [StudentsController, EnrollmentsController],
  providers: [StudentsService, EnrollmentsService, StudentsImportService],
})
export class StudentsModule {}
