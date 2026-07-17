import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { CreateSectionDto } from './dto/create-section.dto';
import { SectionsService } from './sections.service';

@Controller('sections')
@Roles('school_admin')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('class_id') classId?: string) {
    return this.sectionsService.findAll(user.schoolId!, classId ? Number(classId) : undefined);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSectionDto) {
    return this.sectionsService.create(user.schoolId!, dto);
  }
}
