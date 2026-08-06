import { FIRST_RUN_TUTORIAL_KEY } from '../components/FirstRunTutorial';
import { resetDebugNotices } from './debugApi';
import { clearPersistentNoticeFlag } from './persistentNotice';

export type PreviewableNotice = {
  key: string;
  label: string;
  description: string;
};

// The first run is one ordered tutorial rather than a handful of dialogs that used to
// fire independently, so there is a single thing to replay.
export function previewableNotices(): PreviewableNotice[] {
  return [
    {
      key: FIRST_RUN_TUTORIAL_KEY,
      label: 'First-run tutorial',
      description: 'The steps a new account sees the first time it reaches the map.',
    },
  ];
}

export async function resetPreviewableNotices(noticeKeys: string[]) {
  noticeKeys.forEach(clearPersistentNoticeFlag);
  await resetDebugNotices(noticeKeys);
}
