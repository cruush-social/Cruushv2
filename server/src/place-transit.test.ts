import { describe, expect, it } from 'vitest';
import { transitScheduleUrl, transitSmsLink } from './place-transit.js';

describe('transit actions', () => {
  it('prefills the verified NYC MTA bus stop code without sending a message', () => {
    const stop = { operator: 'mta-bus', locality: 'nyc', stopCode: '300000' } as const;
    expect(transitSmsLink(stop)).toBe('sms:511123?body=300000');
    expect(transitSmsLink(stop, true)).toBe('sms:511123&body=300000');
    expect(transitSmsLink(undefined)).toBeNull();
    expect(transitSmsLink({ ...stop, stopCode: '300000&body=other' })).toBeNull();
    expect(transitSmsLink({ ...stop, locality: 'nj' } as unknown as typeof stop)).toBeNull();
  });

  it('allows only HTTPS schedule links without embedded credentials', () => {
    expect(transitScheduleUrl('https://www.mta.info/schedules/subway/a-train')).toBe('https://www.mta.info/schedules/subway/a-train');
    for (const value of ['javascript:alert(1)', '//example.com', 'http://example.com', 'https://user:pass@example.com']) {
      expect(transitScheduleUrl(value)).toBeNull();
    }
  });
});
