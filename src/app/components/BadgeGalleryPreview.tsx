import { BADGE_OPTIONS, buildProfileBadgeOptions, HANKY_GROUP, type BadgeOption } from './BadgePickerPreview';
import { KINK_GROUPS, VIBE_GROUPS } from '../lib/profileOptions';

const GROUP_ORDER = ['Role', 'Position', HANKY_GROUP, 'Vibes', 'Kinks', 'Acts', 'Community', 'Pride', 'Boundaries'];

function everyProfileOption(group: 'Vibes' | 'Kinks') {
  const groups = group === 'Vibes' ? VIBE_GROUPS : KINK_GROUPS;
  return buildProfileBadgeOptions(group, groups.flatMap((category) => category.options));
}

function uniqueOptions(options: BadgeOption[]) {
  const found = new Set<string>();
  return options.filter((option) => {
    if (found.has(option.id)) {
      return false;
    }
    found.add(option.id);
    return true;
  });
}

const ALL_OPTIONS = uniqueOptions([
  ...BADGE_OPTIONS,
  ...everyProfileOption('Vibes'),
  ...everyProfileOption('Kinks'),
]);

const GROUPS = [
  ...GROUP_ORDER.filter((group) => ALL_OPTIONS.some((option) => option.group === group)),
  ...[...new Set(ALL_OPTIONS.map((option) => option.group))].filter((group) => !GROUP_ORDER.includes(group)),
];

function BadgeTile({ option }: { option: BadgeOption }) {
  const Icon = option.icon;

  return (
    <article className="flex min-h-28 min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-white/15 bg-black px-3 py-4 text-center">
      <Icon className="h-10 w-10 text-white" strokeWidth={2.5} />
      <span className="text-sm leading-tight text-white">{option.label}</span>
    </article>
  );
}

export default function BadgeGalleryPreview() {
  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 border-b border-white/15 pb-5">
          <h1 className="font-display text-4xl">Badge icons</h1>
        </header>

        <div className="space-y-10">
          {GROUPS.map((group) => (
            <section aria-labelledby={`badge-group-${group}`} key={group}>
              <h2 className="mb-4 text-xl uppercase tracking-[0.24em] text-white/70" id={`badge-group-${group}`}>
                {group}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {ALL_OPTIONS.filter((option) => option.group === group).map((option) => (
                  <BadgeTile key={option.id} option={option} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
