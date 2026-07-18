import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const NOTICE_AUDIENCES = ['school', 'class', 'section'] as const;
export type NoticeAudienceInput = (typeof NOTICE_AUDIENCES)[number];

export class CreateNoticeDto {
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsNotEmpty()
  body!: string;

  @IsIn(NOTICE_AUDIENCES)
  audience!: NoticeAudienceInput;

  @ValidateIf((o: CreateNoticeDto) => o.audience === 'class')
  @IsInt()
  class_id?: number;

  @ValidateIf((o: CreateNoticeDto) => o.audience === 'section')
  @IsInt()
  section_id?: number;

  @IsOptional()
  @IsBoolean()
  send_sms?: boolean;
}

/**
 * Teacher compose: audience is always 'section' and forced server-side to
 * the caller's own class-taught section — no audience field on the wire.
 */
export class CreateTeacherNoticeDto {
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsNotEmpty()
  body!: string;

  @IsInt()
  section_id!: number;

  @IsOptional()
  @IsBoolean()
  send_sms?: boolean;
}
