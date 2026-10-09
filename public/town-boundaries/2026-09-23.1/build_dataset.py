"""Offline, bounded, public-only Overture -> immutable SQLite release builder.

Requires extract.py --extract-only to finish all eight fixed-release shards.
No network operations or member/application data access occur in this builder.
An incomplete build never receives a complete:true manifest.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import resource
import shutil
import sqlite3
import sys
import threading
import time
import zlib

import duckdb

RELEASE = "2026-09-23.1"
FORMAT = "cruush-town-boundaries"
FILTER = "is_territorial = true AND subtype IN ('locality', 'localadmin')"
BLOCK = 4 * 1024 * 1024
SCHEMA = """CREATE TABLE town (
  id INTEGER PRIMARY KEY,
  area_id TEXT NOT NULL UNIQUE,
  division_id TEXT,
  name TEXT,
  subtype TEXT,
  country TEXT,
  region TEXT,
  geometry_zlib BLOB NOT NULL
);
CREATE VIRTUAL TABLE bounds USING rtree(id,xmin,xmax,ymin,ymax);
"""


def emit(event, **values):
    print(json.dumps({"event": event, **values}, ensure_ascii=False), flush=True)


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            result.update(block)
    return result.hexdigest()


def allocated(root):
    total = 0
    for path in root.rglob("*"):
        try:
            if path.is_file():
                total += path.stat().st_blocks * 512
        except FileNotFoundError:
            pass
    return total


def peak_rss():
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return value if sys.platform == "darwin" else value * 1024


def write_json(path, value):
    pending = path.with_name(path.name + ".pending")
    pending.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    pending.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--output", type=Path)
    options = parser.parse_args()
    root = options.root.resolve()
    output = (options.output or root / ("release-" + RELEASE)).resolve()
    # The single temp-directory disk guard must cover the output as well.
    assert output.is_relative_to(root), "Output must remain within the budgeted root"
    output.mkdir(exist_ok=True)
    target = output / "towns.sqlite"
    building = output / "towns.sqlite.building"
    manifest_path = output / "towns.sqlite.manifest.json"
    assert not target.exists() and not building.exists() and not manifest_path.exists(), \
        "Preserve existing outputs: choose a new empty output directory"
    started = time.monotonic()
    finished = threading.Event()
    stage = {"phase": "preflight"}

    def guard():
        while not finished.wait(2):
            disk = allocated(root)
            snapshot = {"pid": os.getpid(), "elapsedSeconds": round(time.monotonic()-started),
                        "peakRssBytes": peak_rss(), "diskAllocatedBytes": disk, **stage}
            write_json(output / "build-progress.json", snapshot)
            if snapshot["peakRssBytes"] > 900_000_000 or disk > 9_850_000_000:
                emit("budget_stop", **snapshot)
                os._exit(95)

    threading.Thread(target=guard, daemon=True).start()
    source_manifest = json.loads((root / "manifest.json").read_text())
    assert len(source_manifest) == 8
    assert sum(item["size"] for item in source_manifest) == 4_531_207_040
    assert all(f"release/{RELEASE}/theme=divisions/type=division_area/" in item["key"] for item in source_manifest)
    extracted = [root / "artifacts" / f"towns-{index}.parquet" for index in range(8)]
    for index, source in enumerate(source_manifest):
        assert extracted[index].with_suffix(".done").exists(), f"Incomplete extracted shard {index}"
        blocks = json.loads((root / "cache" / f"{index}.blocks.json").read_text())
        assert sorted(set(blocks)) == list(range(math.ceil(source["size"] / BLOCK))), \
            f"Raw cache {index} is sparse; do not treat holes as source data"
        assert (root / "cache" / f"{index}.parquet").stat().st_size == source["size"]

    connection = duckdb.connect(config={
        "memory_limit": "256MB", "threads": "1", "preserve_insertion_order": "true",
        "extension_directory": str(root / "extensions"), "temp_directory": str(root / "spill"),
        "max_temp_directory_size": "500MB", "autoinstall_known_extensions": "false",
        "autoload_known_extensions": "false"
    })
    connection.execute("LOAD spatial")
    validator = connection.cursor()
    connection.execute(f"CREATE VIEW towns AS SELECT * FROM read_parquet({[str(p) for p in extracted]!r})")
    expected_rows = connection.execute("SELECT count(*) FROM towns").fetchone()[0]
    distinct_rows = connection.execute("SELECT count(DISTINCT id) FROM towns").fetchone()[0]
    assert expected_rows == distinct_rows and expected_rows > 0, "Area IDs must be unique and present"
    sources = []
    for index, original in enumerate(source_manifest):
        stage.update(phase="source-validation", shard=index)
        raw = root / "cache" / f"{index}.parquet"
        expected = connection.execute(f"SELECT count(*) FROM read_parquet('{raw}') WHERE {FILTER}").fetchone()[0]
        actual = connection.execute(f"SELECT count(*) FROM read_parquet('{extracted[index]}')").fetchone()[0]
        assert actual == expected, f"Source/extract count mismatch in shard {index}"
        sources.append({"index": index, "url": "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/" + original["key"],
                        "sourceBytes": original["size"], "sourceSha256": digest(raw),
                        "filteredRows": actual, "filteredBytes": extracted[index].stat().st_size,
                        "filteredSha256": digest(extracted[index])})
        emit("validated_source_shard", index=index, rows=actual)

    (output / "schema.sql").write_text(SCHEMA)
    # A hard SQLite page limit reserves 250 MB for all other temp activity.
    # Refuse a too-large build rather than deleting preserved caches/proofs.
    sqlite_byte_budget = 9_750_000_000 - allocated(root)
    assert sqlite_byte_budget > 0
    database = sqlite3.connect(building)
    database.executescript("PRAGMA page_size=4096; PRAGMA journal_mode=DELETE; PRAGMA synchronous=NORMAL; "
                          "PRAGMA cache_size=-4096; PRAGMA mmap_size=0; PRAGMA temp_store=FILE;" + SCHEMA)
    database.execute(f"PRAGMA max_page_count={sqlite_byte_budget // 4096}")
    row_id = 0
    max_wkb_bytes = 0
    total_wkb_bytes = 0
    geometry_types = {}
    country_counts = {}
    subtype_counts = {}
    semantic_hash = hashlib.sha256()
    for index, source_path in enumerate(extracted):
        stage.update(phase="index-build", shard=index, rows=row_id)
        query = f"SELECT id, division_id, name, subtype, country, region, wkb FROM read_parquet('{source_path}')"
        cursor = connection.execute(query)
        while batch := cursor.fetchmany(16):
            # Validate at most 16 geometries together, not a full 2048-row vector.
            # Exact extents avoid dropping border candidates due to source bbox rounding.
            geometry_info = validator.execute("""SELECT ST_IsValid(g), ST_IsEmpty(g),
                   ST_GeometryType(g)::VARCHAR, ST_XMin(g), ST_XMax(g), ST_YMin(g), ST_YMax(g)
                FROM (SELECT ST_GeomFromWKB(wkb) AS g, ordinal
                      FROM UNNEST(?::BLOB[]) WITH ORDINALITY AS items(wkb, ordinal))
                ORDER BY ordinal""", [[row[6] for row in batch]]).fetchall()
            assert len(geometry_info) == len(batch)
            for values, info in zip(batch, geometry_info):
                row = (*values, *info)
                area_id, division_id, name, subtype, country, region, wkb, valid, empty, kind, xmin, xmax, ymin, ymax = row
                assert valid and not empty and kind in ("POLYGON", "MULTIPOLYGON"), \
                    f"Unsafe geometry {area_id}; complete artifact withheld rather than dropping a blocker"
                assert isinstance(name, str) and name.strip() and isinstance(country, str) and len(country) == 2, \
                    f"Missing label data for {area_id}; complete artifact withheld"
                assert all(math.isfinite(value) for value in (xmin, xmax, ymin, ymax))
                assert -180 <= xmin <= xmax <= 180 and -90 <= ymin <= ymax <= 90
                assert subtype in ("locality", "localadmin")
                assert wkb[0] in (0, 1) and int.from_bytes(wkb[1:5], "little" if wkb[0] else "big") in (3, 6), \
                    f"Unsupported non-2D WKB encoding for {area_id}"
                row_id += 1
                database.execute("INSERT INTO town VALUES (?,?,?,?,?,?,?,?)",
                                 (row_id, area_id, division_id, name, subtype, country, region, zlib.compress(wkb, 6)))
                database.execute("INSERT INTO bounds VALUES (?,?,?,?,?)", (row_id, xmin, xmax, ymin, ymax))
                metadata = json.dumps(list(row[:6]), ensure_ascii=False, separators=(",", ":")).encode()
                semantic_hash.update(len(metadata).to_bytes(8, "big"))
                semantic_hash.update(metadata)
                semantic_hash.update(len(wkb).to_bytes(8, "big"))
                semantic_hash.update(wkb)
                max_wkb_bytes = max(max_wkb_bytes, len(wkb))
                total_wkb_bytes += len(wkb)
                geometry_types[kind] = geometry_types.get(kind, 0) + 1
                country_counts[country] = country_counts.get(country, 0) + 1
                subtype_counts[subtype] = subtype_counts.get(subtype, 0) + 1
                if row_id % 4096 == 0:
                    database.commit()
                    stage.update(rows=row_id)
                if row_id % 32768 == 0:
                    emit("index_progress", rows=row_id, bytes=building.stat().st_size, peakRssBytes=peak_rss())
        database.commit()
        emit("indexed_shard", index=index, totalRows=row_id, bytes=building.stat().st_size)
    assert row_id == expected_rows
    stage.update(phase="integrity-check", rows=row_id)
    assert database.execute("SELECT count(*) FROM town").fetchone()[0] == expected_rows
    assert database.execute("SELECT count(*) FROM bounds").fetchone()[0] == expected_rows
    assert database.execute("SELECT count(*) FROM town t LEFT JOIN bounds b ON b.id=t.id WHERE b.id IS NULL").fetchone()[0] == 0
    assert database.execute("PRAGMA integrity_check").fetchall() == [("ok",)]
    assert database.execute("SELECT rtreecheck('bounds')").fetchone()[0] == "ok"
    database.close()
    validator.close()
    connection.close()
    target_hash = digest(building)
    # Final data file first; consumers still refuse it until the complete sidecar exists.
    building.rename(target)
    target.chmod(0o444)
    shutil.copyfile(__file__, output / "build_dataset.py")
    shutil.copyfile(root / "extract.py", output / "extract.py")
    shutil.copyfile(root / "manifest.json", output / "source-manifest.json")
    ledger = json.loads((root / "network.json").read_text())
    manifest = {
        "format": FORMAT, "version": 1, "complete": True,
        "bytes": target.stat().st_size, "sha256": target_hash, "datasetVersion": RELEASE,
        "scope": "All selected territorial locality/localadmin records from all eight division_area shards; not every real-world town",
        "filter": FILTER, "sourceTheme": "divisions", "sourceType": "division_area",
        "license": "ODbL-1.0", "attributionUrl": "https://docs.overturemaps.org/attribution/",
        "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
        "geometry": {"encoding": "zlib-compressed 2D WKB", "coordinateSystem": "WGS84 longitude/latitude degrees",
                     "types": geometry_types, "validatedAllNonempty": True, "validatedAllTopology": True,
                     "maxUncompressedBytes": max_wkb_bytes, "totalUncompressedBytes": total_wkb_bytes,
                     "indexBounds": "Exact geometry extents, rounded outward by SQLite R-tree"},
        "rows": row_id, "countriesRepresented": len(country_counts), "countryCounts": dict(sorted(country_counts.items())),
        "subtypeCounts": subtype_counts, "sources": sources,
        "lookupPolicy": "Return a label only for exactly one strict containing area; unknown for zero/multiple matches, boundaries, invalid data, errors or resource limits. No nearest-city or unverified hierarchy priority.",
        "dataContents": "Public boundaries and source labels only; no member locations, IDs, history or application data",
        "validation": {"sourceRowCountsMatchAllShards": True, "uniqueAreaIds": True,
                       "sqliteIntegrityCheck": "ok", "rtreeCheck": "ok", "semanticSha256": semantic_hash.hexdigest()},
        "build": {"python": platform.python_version(), "duckdb": duckdb.__version__, "sqlite": sqlite3.sqlite_version,
                  "zlib": zlib.ZLIB_RUNTIME_VERSION, "zlibLevel": 6, "threads": 1,
                  "duckdbMemoryLimit": "256MB", "sqliteCacheBytes": 4194304,
                  "sqliteMaxBytes": sqlite_byte_budget,
                  "elapsedSeconds": round(time.monotonic()-started, 2), "peakRssBytes": peak_rss(),
                  "sourceBytesRecorded": ledger["source_bytes"], "priorInterruptedSourceBytesUpperBound": BLOCK,
                  "diskAllocatedBytes": allocated(root), "builderSha256": digest(Path(__file__)),
                  "extractorSha256": digest(root / "extract.py")}
    }
    assert manifest["build"]["sourceBytesRecorded"] + BLOCK <= 4_540_000_000
    assert manifest["build"]["peakRssBytes"] < 1_000_000_000
    assert manifest["build"]["diskAllocatedBytes"] < 10_000_000_000
    write_json(manifest_path, manifest)
    manifest_path.chmod(0o444)
    stage.update(phase="complete")
    finished.set()
    emit("complete", path=str(target), manifest=str(manifest_path), bytes=manifest["bytes"],
         sha256=target_hash, rows=row_id, countries=len(country_counts), build=manifest["build"])


if __name__ == "__main__":
    main()
