import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { AttendanceService } from './attendance.service';

@Controller()
@Roles('guardian')
export class ParentAttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('my/children')
  myChildren(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getMyChildren(user.schoolId!, user.userId);
  }

  @Get('children/:id/attendance')
  childAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('month') month: string,
  ) {
    if (!month) throw new BadRequestException('month query param is required (YYYY-MM)');
    return this.attendanceService.getChildAttendance(user.schoolId!, user.userId, BigInt(id), month);
  }
}
