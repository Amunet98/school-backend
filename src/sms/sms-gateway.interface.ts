export const SMS_GATEWAY = Symbol('SMS_GATEWAY');

export type SmsPurpose = 'absence' | 'notice' | 'fee_reminder' | 'otp';

/**
 * Adapter interface for SMS delivery (doc §5: gateway adapters behind
 * interfaces — provider will change). Delivery-only: the gateway's job is
 * to hand a message to the carrier and report back a provider reference,
 * nothing more. Persistence and status lifecycle (queued/sent/failed,
 * dedup) live in `SmsService` / the `send_sms` queue task, not here — that
 * keeps the gateway swappable (console stub today, Sparrow SMS once
 * `SPARROW_TOKEN` is set) without touching call sites.
 */
export interface SmsGateway {
  deliver(phone: string, body: string): Promise<{ gatewayRef?: string }>;
}
