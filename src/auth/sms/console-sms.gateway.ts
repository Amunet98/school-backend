import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SmsGateway, SmsPurpose } from './sms-gateway.interface';

/**
 * MVP stub: logs the message to the console (so OTPs are visible during
 * dev/testing) and, when a school is known, records it in sms_messages
 * for delivery-debugging/audit parity with the eventual real gateway.
 * Real SMS delivery (Sparrow etc.) plugs in behind SmsGateway later.
 */
@Injectable()
export class ConsoleSmsGateway implements SmsGateway {
  private readonly logger = new Logger('SMS');

  constructor(private readonly prisma: PrismaService) {}

  async send(
    schoolId: bigint | null,
    phone: string,
    body: string,
    purpose: SmsPurpose,
  ): Promise<void> {
    this.logger.log(`[${purpose}] -> ${phone}: ${body}`);

    if (schoolId != null) {
      await this.prisma.smsMessage.create({
        data: {
          schoolId,
          phone,
          body,
          purpose,
          status: 'sent',
        },
      });
    }
  }
}
