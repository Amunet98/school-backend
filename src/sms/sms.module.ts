import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConsoleSmsGateway } from './console-sms.gateway';
import { SMS_GATEWAY } from './sms-gateway.interface';
import { SmsQueueService } from './sms-queue.service';
import { SmsService } from './sms.service';
import { SparrowSmsGateway } from './sparrow-sms.gateway';

/**
 * Owns SMS delivery + queueing end to end: the gateway (console stub or
 * Sparrow, chosen below by whether SPARROW_TOKEN is set), SmsService
 * (persistence/dedup), and the embedded graphile-worker runner. Imported
 * by AuthModule (OTP) and AttendanceModule (absence alerts).
 */
@Module({
  imports: [ConfigModule],
  providers: [
    SmsService,
    SmsQueueService,
    {
      provide: SMS_GATEWAY,
      useFactory: (config: ConfigService) => {
        const sparrowToken = config.get<string>('SPARROW_TOKEN');
        return sparrowToken
          ? new SparrowSmsGateway(config)
          : new ConsoleSmsGateway();
      },
      inject: [ConfigService],
    },
  ],
  exports: [SmsService, SMS_GATEWAY],
})
export class SmsModule {}
