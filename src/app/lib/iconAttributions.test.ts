import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBadgeIconAttributions } from './iconAttributions';

describe('loadBadgeIconAttributions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the required provider credit wording and deduplicates shared sources', async () => {
    const nounIcon = {
      label: 'Cat paw',
      creator: 'trimenz',
      license: 'License.CREATIVECOMMONS',
      source: 'https://thenounproject.com/icon/cat-paw-7604016/',
    };
    const flaticonIcon = {
      label: 'Machine',
      creator: 'Surang',
      license: 'Flaticon free license with attribution',
      source: 'https://www.flaticon.com/free-icon/machine_4648539',
    };
    const manifests = [
      { icons: [nounIcon, flaticonIcon, { label: 'Authored', creator: 'cruush', source: 'authored/icon.svg' }] },
      { icons: [nounIcon] },
    ];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(manifests[0]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(manifests[1]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadBadgeIconAttributions()).resolves.toEqual([
      {
        label: 'Cat paw by trimenz from Noun Project (CC BY 3.0)',
        source: nounIcon.source,
      },
      {
        label: 'Machine designed by Surang from Flaticon',
        source: flaticonIcon.source,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
