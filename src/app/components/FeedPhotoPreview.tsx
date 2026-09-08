import { useState, type ChangeEvent, type ReactNode } from 'react';
import { PHOTO_UPLOAD_ACCEPT } from '../lib/photoUploadFormats';
import { ArrowLeft, Flag, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { FeedPhoto } from '../lib/postApi';
import type { SideBadges } from '../lib/profileApi';
import FeedAttachmentPreview from './FeedAttachmentPreview';
import FeedPhotoViewer from './FeedPhotoViewer';
import HeartPhoto from './HeartPhoto';
import { CruushIcon } from './CruushIconImage';
import ProfileActionTrio from './ProfileActionTrio';
import { ProfilePhotoCropper } from './ProfileEdit';
import UserActivityCapsule from './UserActivityCapsule';
import BugButtonSlot from './BugButtonSlot';

/**
 * A side-by-side of the ways feed photos could read, built out of the same
 * card, heart, and tag pieces the live feed already uses so the comparison is
 * honest. Nothing here posts or fetches; it is a place to choose a direction.
 */

const CARD_CLASS_NAME = 'rounded-2xl border border-white/10 bg-black/72 px-5 py-5 sm:px-8 sm:py-6';
const PREVIEW_PHOTOS = [
  `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff0072"/><stop offset=".52" stop-color="#7b19e8"/><stop offset="1" stop-color="#03ecfc"/></linearGradient></defs><rect width="640" height="640" fill="url(#a)"/><circle cx="470" cy="160" r="110" fill="#ffd166" opacity=".8"/><path d="M0 470 170 300l115 120 110-155 245 375H0Z" fill="#160d38" opacity=".82"/></svg>')}`,
  `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><defs><linearGradient id="b" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#111a63"/><stop offset=".5" stop-color="#3456ff"/><stop offset="1" stop-color="#ff0072"/></linearGradient></defs><rect width="640" height="640" fill="url(#b)"/><circle cx="180" cy="180" r="92" fill="#03ecfc" opacity=".7"/><path d="M0 520c120-120 210-75 300-185 95-116 178-95 340 45v260H0Z" fill="#090916" opacity=".78"/><circle cx="430" cy="240" r="26" fill="#fff" opacity=".7"/></svg>')}`,
  `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffb300"/><stop offset=".45" stop-color="#ff0072"/><stop offset="1" stop-color="#4f0dd9"/></linearGradient></defs><rect width="640" height="640" fill="url(#c)"/><path d="M0 210 130 100l90 94 112-148 308 302v292H0Z" fill="#220b3a" opacity=".75"/><circle cx="490" cy="140" r="64" fill="#03ecfc" opacity=".65"/></svg>')}`,
];

const PREVIEW_FEED_PHOTOS: readonly FeedPhoto[] = PREVIEW_PHOTOS.map((url, index) => ({
  id: `preview-photo-${index + 1}`,
  url,
  thumbnailUrl: url,
  explicit: false,
}));

const PREVIEW_SIDE_BADGES: SideBadges = {
  left: { badge_id: 'leather', intent: 'none', frame: 'circle' },
  right: { badge_id: 'dominant', intent: 'none', frame: 'diamond' },
};

const POSTS = [
  {
    id: 'text-only',
    author: 'Nora',
    pronouns: 'she/her',
    age: '9h ago',
    expiry: 'Never',
    proximity: 'Nearby',
    content: 'Coffee then the late show at Nitehawk if anyone is around Williamsburg tonight.',
    vibes: ['GOTH', 'LEATHER', 'CAM'],
    theme: 'nearby' as const,
    owner: true,
    sideBadges: PREVIEW_SIDE_BADGES,
  },
  {
    id: 'photo-post',
    author: 'Mika',
    pronouns: 'they/them',
    age: '2h ago',
    expiry: '7d',
    proximity: '1.4 mi',
    content: 'Two extra spots for the basement set. Say hi before doors.',
    vibes: ['MUSIC', 'DANCE', 'LATE'],
    theme: 'mutual' as const,
    owner: false,
    sideBadges: PREVIEW_SIDE_BADGES,
  },
] as const;

function PostChrome({ post, children, heartSize }: {
  post: typeof POSTS[number];
  children: ReactNode;
  heartSize: string;
}) {
  const heartGridClass = heartSize === 'w-28' ? 'grid-cols-[8rem_minmax(0,1fr)_auto]' : 'grid-cols-[5rem_minmax(0,1fr)_auto]';

  return (
    <UserActivityCapsule
      className={`${CARD_CLASS_NAME} ${heartGridClass} hover:bg-black/86`}
      heart={(
        <div className={`${heartSize} shrink-0 -translate-y-1`}>
          <HeartPhoto
            className="w-full"
            label={`${post.author} preview`}
            masked={false}
            photo={null}
            theme={post.theme}
            userId={`preview-${post.id}`}
            fallback={<CruushIcon name="cruush" className="h-5 w-5 opacity-20" />}
          />
        </div>
      )}
      name={post.author}
      pronouns={post.pronouns}
      sideBadges={post.sideBadges}
      metadata={(
        <div className="flex h-11 min-w-0 flex-col justify-center gap-0.5 overflow-hidden text-xs leading-snug text-white/62 sm:text-sm">
          <span className="truncate">{post.age}</span>
          <span className="truncate">{post.proximity}</span>
        </div>
      )}
      actions={(
        <ProfileActionTrio
          userName={post.author}
          cruushState={post.theme === 'mutual' ? 'mutual' : 'available'}
          cruushTone={post.theme === 'mutual' ? 'dark' : undefined}
          cruushReceived={post.theme === 'mutual'}
          onCruush={() => undefined}
          canMessage
          onMessage={() => undefined}
          canCenterPin
          onCenterPin={() => undefined}
          size="md"
        />
      )}
      mutual={post.theme === 'mutual'}
      content={(
        <div className="space-y-1.5">
          <p className="text-base leading-relaxed text-white/90 sm:text-lg">{post.content}</p>
          {children}
        </div>
      )}
      cornerAction={(
        <>
          <span className="text-xs text-white/58">{post.expiry}</span>
          {post.owner ? (
            <button aria-label="Delete feed post" className="flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent p-0 text-white/52 transition hover:bg-white/10 hover:text-white" type="button">
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <button aria-label="Report feed post" className="flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent p-0 text-white/52 transition hover:bg-white/10 hover:text-white" type="button">
              <Flag className="h-4 w-4" />
            </button>
          )}
        </>
      )}
    />
  );
}

function readPhotoAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
        resolve(reader.result);
      } else {
        reject(new Error('This image could not be loaded.'));
      }
    };
    reader.onerror = () => reject(new Error('This image could not be loaded.'));
    reader.readAsDataURL(file);
  });
}

function FeedPhotoUploadPreview() {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [croppedPhoto, setCroppedPhoto] = useState<string | null>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      setCroppedPhoto(null);
      setSourceUrl(await readPhotoAsDataUrl(file));
    } catch {
      setSourceUrl(null);
    }
  };

  return (
    <section className="space-y-3" data-testid="feed-photo-upload-preview">
      <div>
        <h2 className="text-base">Photo upload and crop</h2>
        <p className="text-xs text-white/52">Choose a local photo, crop it like a profile photo, and rotate it in 1° steps. The result stays local on this examples page.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-sm text-white transition hover:bg-white/10">
          <CruushIcon name="camera" className="h-4 w-4" />
          Choose photo
          <input
            accept={PHOTO_UPLOAD_ACCEPT}
            aria-label="Choose feed photo"
            className="sr-only"
            onChange={(event) => void handleFileChange(event)}
            type="file"
          />
        </label>
        <button
          className="rounded-full border border-white/10 bg-black/45 px-4 py-2 text-sm text-white/72 transition hover:bg-white/10 hover:text-white"
          onClick={() => {
            setCroppedPhoto(null);
            setSourceUrl(PREVIEW_PHOTOS[0]);
          }}
          type="button"
        >
          Try sample photo
        </button>
      </div>
      {croppedPhoto ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/72 p-4">
          <HeartPhoto
            className="h-16 w-16 shrink-0"
            label="Cropped feed photo preview"
            masked={false}
            photo={croppedPhoto}
            theme="mutual"
            userId="feed-photo-upload-preview"
          />
          <p className="text-sm text-white/75">Cropped photo ready for the feed preview.</p>
        </div>
      ) : null}
      {sourceUrl ? (
        <ProfilePhotoCropper
          onCancel={() => setSourceUrl(null)}
          onConfirm={async (file) => {
            let nextPhoto = sourceUrl;
            try {
              nextPhoto = await readPhotoAsDataUrl(file);
            } catch {
              // Keep the source visible in the local design preview if the browser
              // cannot read the generated crop blob.
            }
            setCroppedPhoto(nextPhoto);
            setSourceUrl(null);
          }}
          processing={false}
          sourceUrl={sourceUrl}
        />
      ) : null}
    </section>
  );
}

const OPTIONS = [
  {
    id: 'one-heart',
    title: 'One heart preview',
    note: 'One attachment gets the full compact preview. The text and card rhythm stay close to the text-only post.',
    count: 1,
  },
  {
    id: 'two-hearts',
    title: 'Two-heart row',
    note: 'Two separate attachment hearts line up in one landscape row.',
    count: 2,
  },
  {
    id: 'three-hearts',
    title: 'Three-heart row',
    note: 'Three attachment hearts line up in one landscape row.',
    count: 3,
  },
] as const;

export default function FeedPhotoPreview() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<{ photos: readonly FeedPhoto[]; index: number } | null>(null);

  return (
    <div className="min-h-screen bg-background pb-24 text-white">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-background/95 px-4 py-3 backdrop-blur-md">
        <button
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-background/55"
          onClick={() => navigate(-1)}
          type="button"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg">Feed posts</h1>
      
        <BugButtonSlot testId="feed-photo-preview-bug-button-slot" />
      </header>

      <main className="mx-auto w-full space-y-8 px-4 py-6">
        <p className="text-sm text-white/68">
          Feed posts keep the plan card structure: identity, stacked activity details, three vibes,
          then the post text. Basic members stay text-only; cruush+ members can attach up to three
          photos, shown as heart previews below.
        </p>

        <FeedPhotoUploadPreview />

        <section className="space-y-3">
          <div>
            <h2 className="text-base">Basic member · text only</h2>
            <p className="text-xs text-white/52">Basic members can post text with no photo attachments.</p>
          </div>
          <PostChrome post={POSTS[0]} heartSize="w-20">{null}</PostChrome>
        </section>

        {OPTIONS.map((option) => (
          <section className="space-y-3" key={option.id}>
            <div>
              <h2 className="text-base">cruush+ · {option.title}</h2>
              <p className="text-xs text-white/52">{option.note}</p>
            </div>
            <PostChrome
              post={POSTS[1]}
              heartSize="w-20"
            >
              <FeedAttachmentPreview
                dlModeActive={false}
                onOpen={(index) => setExpanded({ photos: PREVIEW_FEED_PHOTOS.slice(0, option.count), index })}
                photos={PREVIEW_FEED_PHOTOS.slice(0, option.count)}
              />
            </PostChrome>
          </section>
        ))}
      </main>

      {expanded ? (
        <FeedPhotoViewer
          authorName="Mika"
          index={expanded.index}
          onClose={() => setExpanded(null)}
          onIndexChange={(index) => setExpanded((current) => current ? { ...current, index } : current)}
          photos={expanded.photos}
          postId="preview-photo-post"
        />
      ) : null}
    </div>
  );
}
