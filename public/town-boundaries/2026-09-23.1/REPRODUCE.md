# Offline town-boundary artifact contract

## Runtime contract

Deploy `towns.sqlite` and its adjacent `towns.sqlite.manifest.json` together on a read-only public-data mount, outside Git and outside the ordinary API image. The agreed public route is `/town-boundaries/2026-09-23.1/` containing `towns.sqlite`, `towns.sqlite.manifest.json` and `NOTICE.txt`. Keep the public alteration-method offer available to the release owner. No production deployment is performed by this build.

Required manifest keys:

```json
{"format":"cruush-town-boundaries","version":1,"complete":true,"bytes":123,"sha256":"64-lowercase-hex-characters","datasetVersion":"2026-09-23.1"}
```

The bytes/hash above are illustrative placeholders; only the generated manifest contains actual values. Consumers reject an absent/incomplete/unsupported manifest or any size/hash mismatch. Verify the file in bounded streaming chunks before first use; do not hash/load the entire file into a Buffer. Restart/revalidate when replacing the mounted immutable dataset. Never overwrite a live mounted file in place.

SQLite schema is the prototype-compatible `town(id INTEGER PRIMARY KEY, area_id TEXT, division_id TEXT, name TEXT, subtype TEXT, country TEXT, region TEXT, geometry_zlib BLOB)` and `bounds USING rtree(id,xmin,xmax,ymin,ymax)`. The actual DDL additionally requires a unique non-null area ID and non-null geometry. `id` is internal; `area_id` identifies the source division area; `division_id` identifies its owning division, not a hierarchy rank. `country` is Overture's source two-letter code; this release also contains source-specific X-prefixed codes, so do not assume every code resolves through an ISO-only formatter. Nullable `region` is the supplied subdivision code such as US-NJ. Unknown country/region formatting must not invent a label. Geometry is zlib-compressed 2D Polygon/MultiPolygon WKB in WGS84 longitude/latitude degrees, with holes preserved. Index extents are computed from geometry and rounded outward by SQLite.

Candidate query, binding longitude twice and latitude twice:

```sql
SELECT t.area_id,t.division_id,t.name,t.subtype,t.country,t.region,t.geometry_zlib
FROM bounds b JOIN town t ON t.id=b.id
WHERE b.xmin<=? AND b.xmax>=? AND b.ymin<=? AND b.ymax>=?
```

Use a dedicated bounded worker; `node:sqlite` is synchronous. Prototype limits are a 4 MiB SQLite cache, mmap disabled, at most 128 candidates and 8 MiB decompressed bytes per geometry. Check the actual manifest's maximum geometry size. Reaching a limit is unknown, not permission to discard remaining candidates and return a partial match. Process candidates one at a time. Validate WKB lengths/types, finite coordinates and query bounds. Preserve holes and detect boundaries. Return label fields only when exactly one area strictly contains the point and no candidate boundary/error/limit invalidates the result. Zero or multiple matches return unknown. Do not prefer locality over localadmin, pick the smallest polygon, merge different area IDs by name or use nearest-city fallback without a separately verified hierarchy rule. Public Buenos Aires/Comuna 6 overlap is an intentional unknown case.

Town lookup consumes existing fresh live-map coordinates transiently after the route's authorization checks. This artifact and builder have no access to those coordinates and introduce no member-location storage or first-location snapshot. Application bindings and presentation remain owned by main/Lagrange.

## Rebuild

All scripts in this package are transformation recipes for this public dataset. They access no member data. For a new build, choose an empty workspace with at least the approved temporary disk budget. Copy `extract.py` and `build_dataset.py` there and copy `source-manifest.json` to `manifest.json` (the latter is the fixed eight-object input list, not the SQLite runtime manifest). Reusing an existing workspace preserves every completed `.done` shard and all cached range blocks. An unfinished Parquet shard is preserved under `.interrupted-*` before rewriting from cache. Never delete the cache to restart.

Recorded build environment: Python 3.12.14, DuckDB 1.5.6, SQLite 3.53.1, zlib 1.2.12 on macOS. Install Python 3.12.14 and DuckDB 1.5.6 in an isolated environment. Before the extraction, install DuckDB's `httpfs` and `spatial` extensions to the workspace's `extensions` directory using the same DuckDB version. The scripts disable automatic extension installation/loading; the existing authorized workspace already has these dependencies. No Node/database production dependencies are installed by the builder.

```sh
python3.12 -m venv venv
venv/bin/python -m pip install duckdb==1.5.6
venv/bin/python -c 'import duckdb; c=duckdb.connect(config={"extension_directory":"extensions"}); c.execute("INSTALL httpfs"); c.execute("INSTALL spatial")'
venv/bin/python -u extract.py --extract-only
venv/bin/python -u build_dataset.py --root /absolute/workspace
```

These are cold-reproduction commands for a separate authorized workspace, not instructions to redownload this completed workspace. Run from the chosen workspace directory; the input `manifest.json` and scripts must already be copied there as described above. Use a Python distribution matching the recorded SQLite/zlib versions for closest binary reproduction. Source-package dependency and extension installation are distinct from the measured public boundary source bytes.

The first command fetches only uncached public HTTPS ranges for the fixed release through its loopback cache gateway. Extraction disables automatic GeoParquet geometry conversion and copies the source's existing 2D WKB bytes directly, avoiding an unnecessary geometry/WKB roundtrip and duplicate large buffers. The preserved first six shards were produced with the equivalent `ST_AsWKB(geometry)` projection before this memory optimization. The second command is strictly offline and requires all eight completed extracts and full raw caches. It checks original/extracted counts, unique IDs, every polygon's validity/nonemptiness, finite extents and label fields, then writes the prototype-compatible SQLite. Source object hashes, filtered shard hashes, runtime versions, exact transformation filter, resource measurements and output SHA-256 are in the generated runtime manifest. Byte identity across different DuckDB/SQLite/zlib versions is not promised; use the recorded versions and fixed input hashes. The semantic digest covers ordered label metadata and uncompressed WKB without timestamps.

The build refuses to overwrite an existing SQLite/final manifest or unfinished SQLite build. A failure never declares completion. The first full index attempt reached the strict disk cap and its unjournaled partial database failed integrity checks. Under a subsequent explicit scoped-cleanup allowance, that failed index, the reproducible two-shard prototype SQLite and two superseded interrupted Parquet outputs were removed; all raw source caches, complete extracts and benchmark JSON evidence remain. The retry uses DELETE journaling and NORMAL synchronization for safe rollback. Only deploy an artifact with its final `complete:true` manifest and successful verification report.

## Budget and stop handling

Original experiment limits: public source traffic 4,540,000,000 bytes, total workspace disk 10,000,000,000 bytes, RAM below 1,000,000,000 bytes. Extraction uses 512 MB DuckDB memory, one thread and a 500 MB spill cap; the offline builder uses 256 MB plus a 4 MiB SQLite cache. Run extraction and building sequentially. Shard 6 exceeded prior 256 MB and 384 MB DuckDB buffer limits; DuckDB discarded its failed outputs, while all source cache blocks remained available for retry. The working 512 MB attempt uses a 950 MB process-RSS guard. A conservative 4 MiB allowance is reserved for the previous forced interruption's uncertain in-flight transfer. Recorded traffic remains in `network.json`; the original cache inventory and all explicitly preserved interruption files remain recoverable.

Creating a workspace `STOP` marker stops further range reads at the next read boundary and preserves files. Remove the marker only when a resumption is authorized. A full-source cold replay would consume the budget again, so never reset `network.json` or rerun uncached downloads within the same approved budget. Artifact building has a hard SQLite page cap below the workspace disk limit and does not delete caches to make room.
