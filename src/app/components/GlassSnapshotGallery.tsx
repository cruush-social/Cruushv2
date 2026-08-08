const SNAPSHOT_IDS = ['001', '007', '012', '016', '020', '024', '028', '031', '035', '042', '048', '052'];

export default function GlassSnapshotGallery() {
  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <header className="sticky top-0 z-30 border-b border-white/15 bg-black/80 px-5 py-4 backdrop-blur-xl">
        <h1 className="text-3xl font-black tracking-[-0.05em]">cruush glass snapshots</h1>
        <p className="mt-1 text-sm text-white/70">
          Enlarged bottom/nav crops first. Full screenshots are stacked underneath.
        </p>
        <nav className="mt-3 flex flex-wrap gap-2">
          <a className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm text-white" href="#bottom-crops">
            bottom crops
          </a>
          <a className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm text-white" href="#full-screenshots">
            full screenshots
          </a>
          {SNAPSHOT_IDS.map((id) => (
            <a key={id} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm text-white" href={`#s${id}`}>
              {id}
            </a>
          ))}
        </nav>
      </header>

      <section id="bottom-crops" className="px-5 pb-10 pt-7">
        <h2 className="mb-4 text-2xl font-black tracking-[-0.04em]">Enlarged bottom/nav crops</h2>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {SNAPSHOT_IDS.map((id) => (
            <article key={id} className="overflow-hidden rounded-3xl border border-white/15 bg-[#09090e] shadow-2xl">
              <h3 className="sticky top-[112px] z-10 border-b border-white/10 bg-black/75 px-5 py-3 text-2xl font-black tracking-[-0.04em]">
                snapshot {id}
              </h3>
              <img
                className="block w-full"
                src={`/glass-snapshots/gallery-assets/${id}-bottom.png`}
                alt={`snapshot ${id} enlarged bottom crop`}
              />
            </article>
          ))}
        </div>
      </section>

      <section id="full-screenshots" className="px-5 pb-16 pt-3">
        <h2 className="mb-4 text-2xl font-black tracking-[-0.04em]">Full screenshots</h2>
        <div className="grid gap-8">
          {SNAPSHOT_IDS.map((id) => (
            <article
              id={`s${id}`}
              key={id}
              className="mx-auto w-full max-w-[1280px] overflow-hidden rounded-3xl border border-white/15 bg-[#09090e] shadow-2xl"
            >
              <h3 className="sticky top-[112px] z-10 border-b border-white/10 bg-black/75 px-5 py-3 text-2xl font-black tracking-[-0.04em]">
                snapshot {id}
              </h3>
              <img
                className="block w-full"
                src={`/glass-snapshots/batch-002/${id}.png`}
                alt={`snapshot ${id} full screenshot`}
              />
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
