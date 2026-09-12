import { describe, expect, it } from 'vitest';
import { emptyProfilePayload } from './profileApi';
import { profilePayloadSchema, profileVisibilityRulesSchema } from '../../../server/src/profile-schema';

/**
 * The client builds these shapes and the server parses them with strict
 * schemas, so a field on one side and not the other is a 400 the member reads
 * as "Request validation failed". Parsing the client's own payload with the
 * server's own schema is what catches that before anyone hits it.
 */
describe('the client payload the server actually receives', () => {
  it('accepts the client empty profile payload', () => {
    const result = profilePayloadSchema.safeParse({ ...emptyProfilePayload, display_name: 'Test' });

    if (!result.success) {
      throw new Error(`server rejects the client payload: ${JSON.stringify(result.error.issues, null, 2)}`);
    }

    expect(result.success).toBe(true);
  });

  it('would notice a field the client grew and the server did not', () => {
    const result = profilePayloadSchema.safeParse({
      ...emptyProfilePayload,
      display_name: 'Test',
      somethingTheServerHasNotLearnedYet: true,
    });

    expect(result.success).toBe(false);
  });

  it('accepts the client visibility rules shape', () => {
    const result = profileVisibilityRulesSchema.safeParse(emptyProfilePayload.visibility_rules);

    if (!result.success) {
      throw new Error(`server rejects the client visibility rules: ${JSON.stringify(result.error.issues, null, 2)}`);
    }

    expect(result.success).toBe(true);
  });
});
