import { Injectable, Logger } from '@nestjs/common';
import { SmsGateway } from './sms-gateway.interface';

/**
 * MVP stub: logs the message to the console (so OTP codes and absence
 * alerts are visible during dev/testing) instead of delivering to a real
 * carrier. Used whenever `SPARROW_TOKEN` is not set. Delivery-only per
 * `SmsGateway` — persistence lives in `SmsService`.
 */
@Injectable()
export class ConsoleSmsGateway implements SmsGateway {
  private readonly logger = new Logger('SMS');

  deliver(phone: string, body: string): Promise<{ gatewayRef?: string }> {
    this.logger.log(`-> ${phone}: ${body}`);
    return Promise.resolve({});
  }
}
