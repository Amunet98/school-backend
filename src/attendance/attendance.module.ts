import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { TeacherAttendanceController } from './teacher-attendance.controller';
import { ParentAttendanceController } from './parent-attendance.controller';
import { AbsenceListener } from './listeners/absence.listener';

@Module({
  controllers: [TeacherAttendanceController, ParentAttendanceController],
  providers: [AttendanceService, AbsenceListener],
})
export class AttendanceModule {}
