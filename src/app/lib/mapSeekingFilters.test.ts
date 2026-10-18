import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FILTER_STATE } from '../components/MapFiltersSurface';
import { readMapSeekingFilters, saveMapSeekingFilters } from './mapSeekingFilters';
import { resetAccountPreferences } from './accountPreferences';
beforeEach(()=>{ sessionStorage.clear(); localStorage.clear(); resetAccountPreferences(); localStorage.setItem('cruush_user', JSON.stringify({id:'one'})); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{saved:true}})))); });
describe('applied map Seeking preferences',()=>{
  it('persists choices and explicit Clear across remounts without sharing accounts',()=>{
    const selected={...DEFAULT_FILTER_STATE,identities:['man'],roles:['switch'],distance:25};
    saveMapSeekingFilters('one',selected);
    expect(readMapSeekingFilters('one',DEFAULT_FILTER_STATE)).toEqual(selected);
    expect(readMapSeekingFilters('two',DEFAULT_FILTER_STATE)).toBeNull();
    expect(readMapSeekingFilters(undefined,DEFAULT_FILTER_STATE)).toBeNull();
    saveMapSeekingFilters('one',DEFAULT_FILTER_STATE);
    expect(readMapSeekingFilters('one',DEFAULT_FILTER_STATE)).toEqual(DEFAULT_FILTER_STATE);
  });
  it('ignores corrupt values and unavailable storage',()=>{
    sessionStorage.setItem('cruush:map-seeking-filters:v1','broken');
    expect(readMapSeekingFilters('one',DEFAULT_FILTER_STATE)).toBeNull();
    saveMapSeekingFilters('one',{...DEFAULT_FILTER_STATE,ageRange:[10,99]});
    expect(readMapSeekingFilters('one',DEFAULT_FILTER_STATE)).toBeNull();
    const getter=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('disabled');});
    expect(readMapSeekingFilters('one',DEFAULT_FILTER_STATE)).toBeNull();getter.mockRestore();
  });
});
