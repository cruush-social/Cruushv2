import { describe, expect, it } from 'vitest';
import { createSupportRequestPayloadSchema } from './support-schema.js';
const payload = { category: 'comment', subject: 'cruush subscription survey response', source: 'survey' };
describe('survey response length', () => {
  it('accepts lengthy combined answers without truncation', () => {
    const message = 'x'.repeat(12000);
    expect(createSupportRequestPayloadSchema.parse({ ...payload, message }).message).toBe(message);
  });
  it('keeps ordinary support capped and rejects oversized surveys', () => {
    expect(createSupportRequestPayloadSchema.safeParse({ ...payload, source: 'settings', message: 'x'.repeat(4001) }).success).toBe(false);
    expect(createSupportRequestPayloadSchema.safeParse({ ...payload, message: 'x'.repeat(12001) }).success).toBe(false);
  });
});
