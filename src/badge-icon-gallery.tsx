/**
 * Development-only sheet of every badge icon, grouped the way the badge menu
 * groups them. Each mark is drawn from the same BADGE_OPTIONS list and the same
 * circular frame the app uses, so this page cannot drift from what ships.
 */

import { createRoot } from 'react-dom/client';
import { BADGE_OPTIONS, type BadgeOption } from './app/components/BadgePickerPreview';
import { BadgeFrame } from './app/components/BadgeFrames';
import './styles/index.css';

// The badge as it is worn, not an approximation of it: the same frame, the same
// full-bleed glyph, the same 84% inset the flags get, the same hanky colour
// filling the frame instead of an icon. Sizing the glyph by hand here would
// show a badge nobody ever sees.
const BADGE_SIZE_PX = 48;

function GalleryBadge({ option }: { option: BadgeOption }) {
  const Icon = option.icon;

  return (
    <li className="flex flex-col items-center gap-2">
      <span className="flex text-white" style={{ width: BADGE_SIZE_PX, height: BADGE_SIZE_PX }}>
        <BadgeFrame
          className="h-full w-full"
          contentScalePercent={option.id.startsWith('flag-') ? 84 : undefined}
          frame="circle"
          hankyColor={option.hanky?.color}
          strokeColor="#FFFFFF"
        >
          {!option.hanky ? (
            <span className="flex h-full w-full items-center justify-center text-white">
              <Icon aria-hidden="true" className="h-full w-full" strokeWidth={2.6} />
            </span>
          ) : null}
        </BadgeFrame>
      </span>
      <p className="max-w-[7.5rem] text-center text-[11px] leading-tight text-white/70">
        {option.hanky ? option.hanky.meaning : option.label}
      </p>
    </li>
  );
}

function BadgeIconGallery() {
  const groups = [...new Set(BADGE_OPTIONS.map((option) => option.group))];

  return (
    <main className="min-h-screen bg-[#050505] px-5 py-8 text-white">
      <h1 className="text-2xl">Badge icons</h1>
      <p className="mt-1 text-sm text-white/60">
        {BADGE_OPTIONS.length} badges across {groups.length} groups, drawn from the badge menu's own list.
      </p>
      {groups.map((group) => {
        const options = BADGE_OPTIONS.filter((option) => option.group === group);
        return (
          <section className="mt-10" key={group}>
            <h2 className="text-lg text-white/90">
              {group} <span className="text-sm text-white/40">{options.length}</span>
            </h2>
            <ul className="mt-4 grid grid-cols-4 gap-x-3 gap-y-6 sm:grid-cols-6 lg:grid-cols-9">
              {options.map((option) => <GalleryBadge key={option.id} option={option} />)}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<BadgeIconGallery />);
