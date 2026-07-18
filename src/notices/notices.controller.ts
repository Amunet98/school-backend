import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { NoticesService } from './notices.service';

@Controller('notices')
@Roles('school_admin')
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.noticesService.findAll(user.schoolId!);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateNoticeDto) {
    return this.noticesService.create(user.schoolId!, user.userId, dto);
  }
}
