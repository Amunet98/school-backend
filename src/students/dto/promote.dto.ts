import { IsInt } from 'class-validator';

export class PromoteDto {
  @IsInt()
  from_section_id!: number;

  @IsInt()
  to_section_id!: number;

  @IsInt()
  to_academic_year_id!: number;
}
