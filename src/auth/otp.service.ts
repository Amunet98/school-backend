import { Injectable } from '@nestjs/common';

interface OtpEntry {
  code: string;
  expiresAt: number;
}

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * In-memory OTP store keyed by userId, good enough for a single-instance
 * MVP deployment. The code is also logged to console / recorded in
 * sms_messages via SmsGateway — this class only tracks the pending
 * challenge and its expiry.
 */
@Injectable()
export class OtpService {
  private readonly pending = new Map<string, OtpEntry>();

  generate(userId: bigint): string {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.pending.set(userId.toString(), { code, expiresAt: Date.now() + OTP_TTL_MS });
    return code;
  }

  verify(userId: bigint, code: string): boolean {
    const key = userId.toString();
    const entry = this.pending.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.pending.delete(key);
      return false;
    }
    const ok = entry.code === code;
    if (ok) this.pending.delete(key);
    return ok;
  }
}
