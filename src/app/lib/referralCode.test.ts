import { describe, expect, it } from 'vitest';
import { extractReferralCode } from './referralCode';

describe('extractReferralCode', () => {
  it('takes the code out of a pasted affiliate link', () => {
    expect(extractReferralCode('https://cruush.app/join/aBcD1234eFgH5678')).toBe('aBcD1234eFgH5678');
    expect(extractReferralCode('cruush.app/join/aBcD1234eFgH5678')).toBe('aBcD1234eFgH5678');
    expect(extractReferralCode(' https://cruush.app/join/aBcD1234eFgH5678?utm=x ')).toBe('aBcD1234eFgH5678');
  });

  it('passes a bare code through untouched', () => {
    expect(extractReferralCode('aBcD1234eFgH5678')).toBe('aBcD1234eFgH5678');
    expect(extractReferralCode('  aBcD1234eFgH5678  ')).toBe('aBcD1234eFgH5678');
  });

  it('leaves unrecognisable input alone so the server names the problem', () => {
    expect(extractReferralCode('not a link or code!!')).toBe('not a link or code!!');
    expect(extractReferralCode('')).toBe('');
  });
});
