import { Module } from '@nestjs/common';
import { ClassesController } from './classes/classes.controller';
import { ClassesService } from './classes/classes.service';
import { SectionsController } from './sections/sections.controller';
import { SectionsService } from './sections/sections.service';
import { AcademicYearsController } from './academic-years/academic-years.controller';
import { AcademicYearsService } from './academic-years/academic-years.service';
import { TeachersController } from './teachers/teachers.controller';
import { TeachersService } from './teachers/teachers.service';

@Module({
  controllers: [
    ClassesController,
    SectionsController,
    AcademicYearsController,
    TeachersController,
  ],
  providers: [
    ClassesService,
    SectionsService,
    AcademicYearsService,
    TeachersService,
  ],
  exports: [SectionsService],
})
export class AcademicsModule {}
