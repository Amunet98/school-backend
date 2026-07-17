import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';

@Controller('academic-years')
@Roles('school_admin')
export class AcademicYearsController {
  constructor(private readonly academicYearsService: AcademicYearsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.academicYearsService.findAll(user.schoolId!);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAcademicYearDto,
  ) {
    return this.academicYearsService.create(user.schoolId!, dto);
  }
}
