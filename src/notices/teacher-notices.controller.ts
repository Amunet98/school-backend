import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { CreateTeacherNoticeDto } from './dto/create-notice.dto';
import { NoticesService } from './notices.service';

@Controller()
@Roles('teacher')
export class TeacherNoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Get('my/notices')
  findMyNotices(@CurrentUser() user: AuthenticatedUser) {
    return this.noticesService.findMyNotices(user.schoolId!, user.userId);
  }

  @Post('my/notices')
  createMyNotice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTeacherNoticeDto,
  ) {
    return this.noticesService.createMyNotice(user.schoolId!, user.userId, dto);
  }
}
