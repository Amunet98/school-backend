import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { TeachersService } from './teachers.service';

@Controller('teachers')
@Roles('school_admin')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.teachersService.findAll(user.schoolId!);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTeacherDto,
  ) {
    return this.teachersService.create(user.schoolId!, dto);
  }
}
