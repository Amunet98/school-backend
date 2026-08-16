import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { NoticesService } from './notices.service';

// Mounted at children/notices, not my/notices — TeacherNoticesController
// already owns GET my/notices, and Express/Nest would silently let the
// first-registered handler shadow the second on an exact path collision.
@Controller()
@Roles('guardian')
export class ParentNoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Get('children/notices')
  findNotices(@CurrentUser() user: AuthenticatedUser) {
    return this.noticesService.findNoticesForGuardian(
      user.schoolId!,
      user.userId,
    );
  }
}
