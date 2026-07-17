import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { PromoteDto } from './dto/promote.dto';
import { EnrollmentsService } from './enrollments.service';

@Controller('enrollments')
@Roles('school_admin')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('promote')
  promote(@CurrentUser() user: AuthenticatedUser, @Body() dto: PromoteDto) {
    return this.enrollmentsService.promote(user.schoolId!, dto);
  }
}
