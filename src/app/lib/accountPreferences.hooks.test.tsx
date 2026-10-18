import { useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invalidatePendingApiReads } from './apiClient';
import { resetAccountPreferences, useAccountPreference, loadAccountPreferences, usePreferenceDraftOwner } from './accountPreferences';
const response=(value:unknown)=>new Response(JSON.stringify({data:value}));
beforeEach(()=>{localStorage.clear();resetAccountPreferences();invalidatePendingApiReads();});
afterEach(()=>vi.unstubAllGlobals());
it('clears old account state on cross-tab account changes and rejects a stale setter',async()=>{
  localStorage.setItem('cruush_user',JSON.stringify({id:'one'}));
  const writes:unknown[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
    if(init?.method==='PUT'){writes.push(JSON.parse(init.body));return response({saved:true});}
    return response({'messages.search':JSON.parse(localStorage.getItem('cruush_user')!).id==='one'?'first':'second'});
  }));
  await loadAccountPreferences();
  const {result}=renderHook(()=>useAccountPreference('messages.search',''));
  expect(result.current[0]).toBe('first');const staleSetter=result.current[1];
  await act(async()=>{localStorage.setItem('cruush_user',JSON.stringify({id:'two'}));window.dispatchEvent(new StorageEvent('storage',{key:'cruush_user'}));});
  await waitFor(()=>expect(result.current[0]).toBe('second'));
  act(()=>staleSetter(previous=>previous+' wrong account'));
  expect(writes).toHaveLength(0);expect(result.current[0]).toBe('second');
});

it('discards an unsaved filter draft when its account changes', async () => {
  localStorage.setItem('cruush_user', JSON.stringify({ id: 'one' }));
  vi.stubGlobal('fetch', vi.fn(async () => response({})));
  await loadAccountPreferences();
  const { result } = renderHook(() => {
    const [draft, setDraft] = useState('');
    usePreferenceDraftOwner(() => setDraft(''));
    return { draft, setDraft };
  });
  act(() => result.current.setDraft('private unfinished search'));
  expect(result.current.draft).toBe('private unfinished search');
  await act(async () => {
    localStorage.setItem('cruush_user', JSON.stringify({ id: 'two' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'cruush_user' }));
  });
  expect(result.current.draft).toBe('');
});
