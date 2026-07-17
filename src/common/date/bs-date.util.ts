import NepaliDate from 'nepali-date-converter';

/**
 * Single home for AD <-> BS (Bikram Sambat) conversion, wrapping
 * `nepali-date-converter`. The database only ever stores AD dates
 * (see prisma schema); BS strings are produced here purely for API
 * response display fields (`date_bs`) and parsed here when BS input
 * needs to become a JS Date for storage/filtering.
 */

/** AD Date -> BS date string, e.g. "2083-04-02". */
export function toBs(date: Date): string {
  return new NepaliDate(date).format('YYYY-MM-DD');
}

/** BS date string (YYYY-MM-DD or YYYY/MM/DD) -> AD JS Date. */
export function parseBs(bsDateString: string): Date {
  return new NepaliDate(bsDateString).toJsDate();
}
