import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { NoticesService } from './notices.service';
import { NoticesController } from './notices.controller';
import { TeacherNoticesController } from './teacher-notices.controller';

@Module({
  imports: [SmsModule],
  controllers: [NoticesController, TeacherNoticesController],
  providers: [NoticesService],
})
export class NoticesModule {}
