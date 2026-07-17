import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class GuardianInputDto {
  @IsString()
  @IsNotEmpty()
  full_name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsOptional()
  @IsString()
  relation?: string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}

export class EnrollmentInputDto {
  @IsInt()
  academic_year_id!: number;

  @IsInt()
  section_id!: number;

  @IsOptional()
  @IsInt()
  roll_no?: number;
}

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  full_name!: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  photo_url?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuardianInputDto)
  guardians?: GuardianInputDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => EnrollmentInputDto)
  enrollment?: EnrollmentInputDto;
}
