export const SMS_GATEWAY = Symbol('SMS_GATEWAY');

export type SmsPurpose = 'absence' | 'notice' | 'fee_reminder' | 'otp';

/**
 * Adapter interface for SMS delivery (doc §5: gateway adapters behind
 * interfaces — provider will change). Only a console-logging stub exists
 * in Milestone 1; a real provider (Sparrow SMS etc.) plugs in later
 * without touching call sites.
 */
export interface SmsGateway {
  send(
    schoolId: bigint | null,
    phone: string,
    body: string,
    purpose: SmsPurpose,
  ): Promise<void>;
}
