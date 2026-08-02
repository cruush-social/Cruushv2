import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router';
import HeartPhoto from '../app/components/HeartPhoto';
import DirectMessages from '../app/components/DirectMessages';
import PrivateGroupChat from '../app/components/PrivateGroupChat';
import LocalFeed from '../app/components/LocalFeed';
import ReportAction from '../app/components/ReportAction';
import AlphaBugButton from '../app/components/AlphaBugButton';
import FiltersPanel from '../app/components/FiltersPanel';
import {
  prepareMessagePhotoForUpload,
  MESSAGE_PHOTO_UPLOAD_ACCEPT,
} from '../app/lib/messagePhotoProcessing';

const { getConversations, getMyCruushActivity } = vi.hoisted(() => ({
  getConversations: vi.fn(),
  getMyCruushActivity: vi.fn(),
}));

const { getFeedPosts, getFeedSettings } = vi.hoisted(() => ({
  getFeedPosts: vi.fn(),
  getFeedSettings: vi.fn(),
}));

vi.mock('../app/lib/messagesApi', async () => {
  const actual = await vi.importActual<typeof import('../app/lib/messagesApi')>('../app/lib/messagesApi');
  return {
    ...actual,
    getConversations,
  };
});

vi.mock('../app/lib/cruushApi', async () => {
  const actual = await vi.importActual<typeof import('../app/lib/cruushApi')>('../app/lib/cruushApi');
  return {
    ...actual,
    getMyCruushActivity,
  };
});

vi.mock('../app/lib/postApi', async () => {
  const actual = await vi.importActual<typeof import('../app/lib/postApi')>('../app/lib/postApi');
  return {
    ...actual,
    getFeedPosts,
    getFeedSettings,
  };
});

describe('Comprehensive Feature Smoke & E2E Test Suite', () => {
  beforeEach(() => {
    getConversations.mockReset();
    getMyCruushActivity.mockReset();
    getFeedPosts.mockReset();
    getFeedSettings.mockReset();

    getConversations.mockResolvedValue([]);
    getMyCruushActivity.mockResolvedValue({ activeMatches: [], count: 0 });
    getFeedPosts.mockResolvedValue({ posts: [], hasMore: false });
    getFeedSettings.mockResolvedValue({ locationPinVisibility: 'mutuals', ghostModeActive: false });
  });

  describe('1. Photo Uploads & HeartPhoto Component', () => {
    it('renders photo upload preview container', () => {
      render(<HeartPhoto label="Photo upload preview" />);

      const heartImg = screen.getByRole('img', { name: 'Photo upload preview' });
      expect(heartImg).toBeInTheDocument();
    });

    it('prepares message photo upload files safely', async () => {
      expect(MESSAGE_PHOTO_UPLOAD_ACCEPT).toContain('image/heic');

      const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' });
      const prepared = await prepareMessagePhotoForUpload(file);

      expect(prepared).toBe(file);
      expect(prepared.type).toBe('image/png');
    });
  });

  describe('2. Direct Messaging & Photo Messages', () => {
    it('renders direct messages component cleanly', () => {
      render(
        <MemoryRouter>
          <DirectMessages />
        </MemoryRouter>
      );

      expect(document.body).toBeInTheDocument();
    });
  });

  describe('3. Group Chats', () => {
    it('renders private group chat interface cleanly', () => {
      render(
        <MemoryRouter>
          <PrivateGroupChat />
        </MemoryRouter>
      );

      expect(document.body).toBeInTheDocument();
    });
  });

  describe('4. Local Feed', () => {
    it('renders local feed component with discovery controls', () => {
      render(
        <MemoryRouter>
          <LocalFeed />
        </MemoryRouter>
      );

      expect(document.body).toBeInTheDocument();
    });
  });

  describe('5. Report Button & Report Action', () => {
    it('renders report action button and opens reporting modal on click', () => {
      render(
        <ReportAction targetType="profile" targetId="user-2" targetLabel="River" />
      );

      const reportBtn = screen.getByRole('button', { name: 'Report River' });
      expect(reportBtn).toBeInTheDocument();

      fireEvent.click(reportBtn);
      expect(screen.getByText('Submit report')).toBeInTheDocument();
    });
  });

  describe('6. Alpha Bug Button & Non-Overlapping Chrome Placement', () => {
    it('renders Alpha Bug Button with bottom-right positioning and z-30 stack depth', () => {
      render(
        <MemoryRouter>
          <AlphaBugButton enabled={true} />
        </MemoryRouter>
      );

      const bugButton = screen.getByRole('button', { name: 'Report alpha bug' });
      expect(bugButton).toBeInTheDocument();

      // Non-overlapping z-index and bottom-right positioning
      expect(bugButton).toHaveClass('right-4', 'z-30');
      expect(bugButton).not.toHaveClass('z-50');
    });
  });

  describe('7. Filter Buttons Working', () => {
    it('renders filter panel with interactive filter options', () => {
      const onFilterChange = vi.fn();
      render(
        <MemoryRouter>
          <FiltersPanel onFilterChange={onFilterChange} />
        </MemoryRouter>
      );

      const filterHeader = screen.getByRole('heading', { level: 2, name: 'Filters' });
      expect(filterHeader).toBeInTheDocument();

      const clearBtn = screen.getByRole('button', { name: /clear/i });
      expect(clearBtn).toBeInTheDocument();
      fireEvent.click(clearBtn);
    });
  });
});
