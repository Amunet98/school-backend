import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { NoticesService } from './notices.service';
import { NoticesController } from './notices.controller';
import { TeacherNoticesController } from './teacher-notices.controller';
import { ParentNoticesController } from './parent-notices.controller';
import { NoticeSmsListener } from './listeners/notice-sms.listener';

@Module({
  imports: [SmsModule],
  controllers: [
    NoticesController,
    TeacherNoticesController,
    ParentNoticesController,
  ],
  providers: [NoticesService, NoticeSmsListener],
})
export class NoticesModule {}
