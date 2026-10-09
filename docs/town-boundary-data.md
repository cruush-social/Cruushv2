# Town boundary data release handoff

Status: local source/transformation offer prepared from the completed owner
artifact. The database is not mounted or published by this task. Main owns
dataset mounting, runtime activation and publication; Ampere owns the builder.
No database-download link is advertised before a verified mount exists.

## Approved scope

The only Settings change is the exact `Town boundary data` anchor in the existing
Map attribution link row, using its existing style, icon and new-tab behavior.
Its target is `/town-boundary-data.html`, a plain public HTML document using the
existing `/pages.css`; no SPA/nginx route, shared style or neighboring UI change.

Town labels are to be derived transiently from the existing fresh encrypted
live-map location. This data package does not authorize any extra first-location
snapshot, new member-coordinate storage or relaxed pin/access rules. It contains
only public administrative boundary data, never member location/state records.

## Pinned source and notices

- Source: [Overture Maps Divisions](https://docs.overturemaps.org/guides/divisions/),
  release `2026-09-23.1`, type `division_area`.
- Public source prefix:
  `s3://overturemaps-us-west-2/release/2026-09-23.1/theme=divisions/type=division_area/`.
- [Overture's Divisions attribution](https://docs.overturemaps.org/attribution/#divisions)
  lists ODbL for the theme, OpenStreetMap contributors under ODbL, and
  geoBoundaries, Esri Community Maps contributors and LINZ under CC BY 4.0.
- Machine-readable notice: `public/town-boundaries/2026-09-23.1/NOTICE.txt`.
  Preserve supplied source-specific notices as well as these theme-level credits.
- [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) sections 4.2–4.6
  address notices, share-alike and access to the derivative or its complete
  alteration method. [CC BY 4.0 section 3](https://creativecommons.org/licenses/by/4.0/legalcode.en#s3)
  addresses attribution, license links, retained notices and identifying changes.
  These are source references, not a legal opinion or compliance certification.

## Confirmed public paths

| File | Public path |
| --- | --- |
| Notice page | `/town-boundary-data.html` |
| Entire derivative database | `/town-boundaries/2026-09-23.1/towns.sqlite` |
| Matching build manifest | `/town-boundaries/2026-09-23.1/towns.sqlite.manifest.json` |
| Source/license notice | `/town-boundaries/2026-09-23.1/NOTICE.txt` |
| Exact reproduction recipe | `/town-boundaries/2026-09-23.1/REPRODUCE.md` |
| Exact extractor | `/town-boundaries/2026-09-23.1/extract.py` |
| Exact offline builder | `/town-boundaries/2026-09-23.1/build_dataset.py` |
| Pinned eight-object input list | `/town-boundaries/2026-09-23.1/source-manifest.json` |
| SQLite DDL | `/town-boundaries/2026-09-23.1/schema.sql` |

All small files above are shipped in `public/`; only the database path remains
reserved. Their presence in the checkout is not production-publication proof.
Keep the 2.82 GB database outside the source checkout and frontend bundle. Mount
only the release's public-data directory read-only, never an application/member
database or broad parent directory. A future public mount over this directory
must preserve every source/notice file and link, not shadow the source offer.

## Exact owner-source handoff

Latest authorization: copy the existing generated scripts unchanged into the
public source package, with apply_patch only. This supersedes the earlier pending
plan to put a duplicate builder under `server/scripts/build-town-boundaries.*`.
These scripts are downloadable reproduction recipes, not imported API code.

The exact owner release is
`/private/tmp/cruush-town-feasibility.ZoajXQ/release-2026-09-23.1`.
This local handoff path is not included in the public package. Its final manifest
records a complete artifact of 2,817,638,400 bytes, SHA-256
`31a3e4c78d54d48c1a755cc5f2b21032d5ee0680d59f20e8f39930dab975697d`,
576,368 records and 229 distinct source country codes. Main/owner reports full
streaming readback, file/semantic-hash matches and SQLite/R-tree integrity. This
sidecar did not repeat that full readback or perform a cold rebuild.

Copied Python source hashes match the complete manifest:

- `extract.py`: `154b06e0bfe89f105d89818d6db4a8cb1bc2c621fbf937fbc74b221c78fe05a9`
- `build_dataset.py`: `7d1f987731a00bac807ccc384bfd39c4dba359b0ad2ac35ff5c4751ad69f0a2b`

Both scripts, REPRODUCE.md, schema.sql and the runtime manifest are byte-identical
to the owner copies. The input source-manifest JSON is identical apart from a
final newline added by apply_patch; no source object or byte length changed.
No raw SQLite, interrupted artifact or historical BUILD_BLOCKED record is copied.

REPRODUCE.md contains the complete workspace setup, Python 3.12.14/DuckDB 1.5.6
installation and extension setup, exact extraction/build commands, SQLite 3.53.1
and zlib 1.2.12 build versions, resource limits and restart rules. Input objects
are fixed to all eight release shards; their hashes and filtered row counts are
in the runtime manifest. The code selects territorial locality/localadmin areas,
preserves supplied labels and full 2D WKB, compresses with zlib level 6, and adds
the schema's R-tree using validated geometry extents. No boundary simplification,
private member input or fallback dataset is introduced.

The recipe explicitly documents the first six cached shards' equivalent
ST_AsWKB projection and later direct-WKB extraction. Byte-identical cold replay
across different library versions is not promised. Rebuilds require public
source/dependency downloads and approximately the documented 10 GB workspace;
none were performed by this source-copy task. Do not run extract.py without the
documented `--extract-only` option: its later prototype path is not the final
release builder. The exact scripts remain unchanged, including that distinction.

## Release gate, owned by main

- The source-method alternative must actually be published with all seven linked
  files, complete commands, matching source hashes and contributor/license notices.
  An upstream link or a private checkout alone is not the public source offer.
- Keep the page's database-download status explicit until the separate database
  mount is approved and verified. No fake dataset link or release claim.
- The API read-only Compose mount approval remains with main/owner. This source
  bundle does not authorize any Compose, image, runtime or production changes.
- On publication, verify unauthenticated source GETs return the intended files,
  not a login or SPA fallback. If a database download is later offered, verify
  manifest/hash/content types and a bounded SQLite range read before linking it.
- Verify the Settings link opens the notice and its source-method links work.
  Check normal mobile/desktop presentation and neighboring Settings controls in
  main's owned browser review. No cosmetic-only automated tests are required.
- No production writes or publication are authorized for this sidecar task.
