import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsImportService } from './import/students-import.service';
import { StudentsService } from './students.service';

@Controller('students')
@Roles('school_admin')
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly studentsImportService: StudentsImportService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('section_id') sectionId?: string) {
    return this.studentsService.findAll(user.schoolId!, sectionId ? Number(sectionId) : undefined);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.studentsService.findOneOrThrow(user.schoolId!, BigInt(id));
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStudentDto) {
    return this.studentsService.create(user.schoolId!, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.studentsService.update(user.schoolId!, BigInt(id), dto);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  importCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query('academic_year_id') academicYearId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required (field name "file")');
    }
    if (!academicYearId) {
      throw new BadRequestException('academic_year_id query param is required');
    }
    return this.studentsImportService.importCsv(
      user.schoolId!,
      BigInt(academicYearId),
      file.buffer,
    );
  }
}
