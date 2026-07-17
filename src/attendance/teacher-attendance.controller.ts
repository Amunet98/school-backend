import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';

@Controller()
@Roles('teacher')
export class TeacherAttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('my/sections')
  mySections(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getMySections(user.schoolId!, user.userId);
  }

  @Get('sections/:id/students')
  sectionStudents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('date') date: string,
  ) {
    return this.attendanceService.getSectionStudents(user.schoolId!, BigInt(id), date);
  }

  @Post('sections/:id/attendance')
  markAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.attendanceService.markAttendance(user.schoolId!, BigInt(id), user.userId, dto);
  }
}
