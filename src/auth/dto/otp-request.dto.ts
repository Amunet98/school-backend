import { IsNotEmpty, IsString } from 'class-validator';

export class OtpRequestDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;
}
