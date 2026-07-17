import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAcademicYearDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsDateString()
  start_date!: string;

  @IsDateString()
  end_date!: string;

  @IsOptional()
  @IsBoolean()
  is_current?: boolean;
}
