import {
  absenceAlert,
  isSmsEnabled,
  noticeAlert,
  otpTemplate,
  resolveLocale,
} from './sms-templates';

describe('resolveLocale', () => {
  it('defaults to ne when settings is empty/missing', () => {
    expect(resolveLocale({})).toBe('ne');
    expect(resolveLocale(undefined)).toBe('ne');
    expect(resolveLocale(null)).toBe('ne');
  });

  it('defaults to ne for an unrecognized locale value', () => {
    expect(resolveLocale({ locale: 'fr' })).toBe('ne');
  });

  it('returns en when settings.locale is exactly "en"', () => {
    expect(resolveLocale({ locale: 'en' })).toBe('en');
  });

  it('returns ne when settings.locale is exactly "ne"', () => {
    expect(resolveLocale({ locale: 'ne' })).toBe('ne');
  });
});

describe('isSmsEnabled', () => {
  it('defaults to true when settings is empty/missing', () => {
    expect(isSmsEnabled({})).toBe(true);
    expect(isSmsEnabled(undefined)).toBe(true);
    expect(isSmsEnabled(null)).toBe(true);
  });

  it('is false only when settings.sms_enabled is exactly false', () => {
    expect(isSmsEnabled({ sms_enabled: false })).toBe(false);
    expect(isSmsEnabled({ sms_enabled: true })).toBe(true);
    expect(isSmsEnabled({ sms_enabled: 'false' })).toBe(true);
  });
});

describe('absenceAlert', () => {
  const params = {
    studentName: 'Aarav Sharma',
    schoolName: 'Sunrise Secondary School',
    dateBs: '2083-04-02',
  };

  it('renders the ne template with student, school, and BS date', () => {
    const body = absenceAlert('ne', params);
    expect(body).toContain('Aarav Sharma');
    expect(body).toContain('Sunrise Secondary School');
    expect(body).toContain('2083-04-02');
  });

  it('renders the en template with student, school, and BS date', () => {
    const body = absenceAlert('en', params);
    expect(body).toBe(
      'Sunrise Secondary School: Aarav Sharma is absent today (2083-04-02 BS). Please contact the school if this is unexpected.',
    );
  });
});

describe('noticeAlert', () => {
  const params = {
    schoolName: 'Sunrise Secondary School',
    title: 'School closed tomorrow for Dashain',
  };

  it('renders the ne template with school and title, title-only (no body)', () => {
    const body = noticeAlert('ne', params);
    expect(body).toContain('Sunrise Secondary School');
    expect(body).toContain('School closed tomorrow for Dashain');
  });

  it('renders the en template with school and title', () => {
    const body = noticeAlert('en', params);
    expect(body).toBe(
      'Sunrise Secondary School notice: School closed tomorrow for Dashain',
    );
  });
});

describe('otpTemplate', () => {
  it('renders the ne template with the code', () => {
    expect(otpTemplate('ne', { code: '123456' })).toContain('123456');
  });

  it('renders the en template with the code', () => {
    expect(otpTemplate('en', { code: '123456' })).toBe(
      'Your login code is 123456. It expires in 5 minutes.',
    );
  });
});
