import { describe, expect, it } from 'vitest';
import { buildCruushPlusStorePath, readCruushPlusConversionContext } from './cruushPlusConversion';

describe('cruush+ conversion context', () => {
  it('builds a Store path from allowlisted aggregate context', () => {
    expect(buildCruushPlusStorePath('map_top', 'overview', 'store'))
      .toBe('/store?surface=map_top&benefit=overview&experiment=store');
  });

  it('drops unknown query values instead of forwarding arbitrary data to analytics', () => {
    expect(readCruushPlusConversionContext('?surface=secret-user&benefit=free-text&experiment=store&token=secret'))
      .toEqual({ surface: undefined, benefit: undefined, experimentVariant: 'store' });
  });
});
