import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsGateway } from './sms-gateway.interface';

/**
 * Sparrow SMS (https://sparrowsms.com) adapter. Env-gated: only
 * constructed by `SmsModule`'s provider factory when `SPARROW_TOKEN` is
 * set (see sms.module.ts); the console gateway is used otherwise. No live
 * credentials exist yet for this milestone, so this has not been
 * exercised against the real API — the response id field name
 * (`response_id`) is Sparrow's documented field but is unverified here;
 * double-check it once real credentials are available.
 */
@Injectable()
export class SparrowSmsGateway implements SmsGateway {
  private readonly logger = new Logger('SMS:Sparrow');

  constructor(private readonly config: ConfigService) {}

  async deliver(phone: string, body: string): Promise<{ gatewayRef?: string }> {
    const token = this.config.get<string>('SPARROW_TOKEN');
    const from = this.config.get<string>('SPARROW_IDENTITY') ?? '';

    const res = await fetch('https://api.sparrowsms.com/v2/sms/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: token ?? '',
        from,
        to: phone,
        text: body,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Sparrow SMS delivery failed (${res.status}): ${text}`);
    }

    const data: unknown = await res.json().catch(() => undefined);
    const gatewayRef = this.extractRef(data);
    if (!gatewayRef) {
      this.logger.warn(
        'Sparrow SMS responded 2xx but no recognizable id field was found in the response body',
      );
    }
    return { gatewayRef };
  }

  private extractRef(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const obj = data as Record<string, unknown>;
    const candidate = obj.response_id ?? obj.id;
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      return String(candidate);
    }
    return undefined;
  }
}
