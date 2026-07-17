export type SmsLocale = 'ne' | 'en';

/**
 * Resolve the SMS locale from a school's `settings` JSON column.
 * Defaults to 'ne' when `settings.locale` is absent or not a recognized
 * value — Nepali is the default audience for this product.
 */
export function resolveLocale(settings: unknown): SmsLocale {
  if (
    settings &&
    typeof settings === 'object' &&
    (settings as { locale?: unknown }).locale === 'en'
  ) {
    return 'en';
  }
  return 'ne';
}

/**
 * Whether SMS is enabled for a school. Defaults to true — only an
 * explicit `settings.sms_enabled === false` turns it off.
 */
export function isSmsEnabled(settings: unknown): boolean {
  if (settings && typeof settings === 'object') {
    return (settings as { sms_enabled?: unknown }).sms_enabled !== false;
  }
  return true;
}

/**
 * Absence alert sent to a student's primary guardian. Kept short —
 * Nepali (Unicode) SMS segments are 70 characters; a body under ~140
 * chars stays within 2 segments for either script.
 */
export function absenceAlert(
  locale: SmsLocale,
  params: { studentName: string; schoolName: string; dateBs: string },
): string {
  const { studentName, schoolName, dateBs } = params;
  if (locale === 'en') {
    return `${schoolName}: ${studentName} is absent today (${dateBs} BS). Please contact the school if this is unexpected.`;
  }
  return `${schoolName}: ${studentName} aaja (${dateBs} BS) school gaira anupasthit chha. Prashna vaye school lai sampark garnuhos.`;
}

/** OTP login-code SMS. */
export function otpTemplate(
  locale: SmsLocale,
  params: { code: string },
): string {
  const { code } = params;
  if (locale === 'en') {
    return `Your login code is ${code}. It expires in 5 minutes.`;
  }
  return `Tapaiko login code ${code} ho. Yo 5 minute ma expire huncha.`;
}
