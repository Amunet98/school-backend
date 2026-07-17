import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  ValidateNested,
} from 'class-validator';

const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'leave'] as const;
export type AttendanceStatusInput = (typeof ATTENDANCE_STATUSES)[number];

export class AttendanceRecordInputDto {
  @IsInt()
  enrollment_id!: number;

  @IsIn(ATTENDANCE_STATUSES)
  status!: AttendanceStatusInput;
}

export class MarkAttendanceDto {
  @IsDateString()
  date!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordInputDto)
  records!: AttendanceRecordInputDto[];
}
