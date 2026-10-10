import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
const mocks = vi.hoisted(() => ({ getTravelPin: vi.fn(), loadTravelPinTownLabel: vi.fn() }));
vi.mock('./travel-pins.js', () => ({ getTravelPin: mocks.getTravelPin }));
vi.mock('./current-town-labels.js', () => ({ loadTravelPinTownLabel: mocks.loadTravelPinTownLabel }));
import { getMhcLocationLabel } from './mhc-location-label.js';
const app = {} as FastifyInstance;
describe('MHC display location', () => {
 beforeEach(() => { vi.clearAllMocks(); mocks.getTravelPin.mockResolvedValue({ latitude:40.7,longitude:-74,expiresAtMs:Date.now()+60000 }); mocks.loadTravelPinTownLabel.mockResolvedValue('New York, NY'); });
 it('uses the active MHC pin town for shared Precise mode', async () => {
  expect(await getMhcLocationLabel(app,'subject','precise')).toBe('New York, NY');
  expect(mocks.loadTravelPinTownLabel).toHaveBeenCalledWith(app,expect.objectContaining({latitude:40.7,longitude:-74}));
 });
 it('keeps Approximate coarse without looking up a town', async () => {
  expect(await getMhcLocationLabel(app,'subject','approximate')).toBe('Nearby');
  expect(mocks.loadTravelPinTownLabel).not.toHaveBeenCalled();
 });
 it.each([null,{latitude:40.7,longitude:-74,expiresAtMs:0}])('does not override physical labels without an active pin: %j', async pin => {
  mocks.getTravelPin.mockResolvedValue(pin);
  expect(await getMhcLocationLabel(app,'subject','precise')).toBeNull();
  expect(mocks.loadTravelPinTownLabel).not.toHaveBeenCalled();
 });
 it('does not fall back to a physical town when travel-town lookup fails', async () => {
  mocks.loadTravelPinTownLabel.mockResolvedValue(null);
  expect(await getMhcLocationLabel(app,'subject','precise')).toBe('Nearby');
 });
});
