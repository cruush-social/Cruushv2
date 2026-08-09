import { ALPHA_BUG_TIP_STORAGE_KEY } from '../components/AlphaBugButton';
import { firstFeedPostPromptStorageKey } from '../components/FirstFeedPostPrompt';
import { MAP_CONTROLS_INTRO_STORAGE_KEY } from '../components/MapHome';
import { resetDebugNotices } from './debugApi';
import { DL_MODE_DEFAULT_NOTICE_KEY } from './dlMode';
import { clearPersistentNoticeFlag } from './persistentNotice';

export type PreviewableNotice = {
  key: string;
  label: string;
  description: string;
};

// Every one-time dialog that explains part of the app. The preview page replays
// them so onboarding flows can be reviewed without deleting the account.
export function previewableNotices(userId: string): PreviewableNotice[] {
  return [
    {
      key: DL_MODE_DEFAULT_NOTICE_KEY,
      label: 'DL Mode is on by default',
      description: 'Explains that explicit photos start masked.',
    },
    {
      key: MAP_CONTROLS_INTRO_STORAGE_KEY,
      label: 'Map controls intro',
      description: 'Walks through the map controls on first load.',
    },
    {
      key: firstFeedPostPromptStorageKey(userId),
      label: 'First feed post prompt',
      description: 'Encourages a first local post after onboarding.',
    },
    {
      key: ALPHA_BUG_TIP_STORAGE_KEY,
      label: 'Bug report tip',
      description: 'Points out the in-app bug report button.',
    },
  ];
}

export async function resetPreviewableNotices(noticeKeys: string[]) {
  noticeKeys.forEach(clearPersistentNoticeFlag);
  await resetDebugNotices(noticeKeys);
}
