"""Bounded public Overture feasibility experiment; no cruush/member data."""
import gzip
import atexit
import hashlib
import http.server
import json
import os
from pathlib import Path
import re
import resource
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zlib

import duckdb

ROOT = Path(__file__).resolve().parent
RELEASE = "2026-09-23.1"
PREFIX = f"release/{RELEASE}/theme=divisions/type=division_area/"
ORIGIN = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/"
SOURCE_LIMIT = 4_540_000_000
BLOCK = 4 * 1024 * 1024
# The prior SIGTERM may have interrupted one range before its ledger flush.
# Reserve its full size rather than pretending those network bytes were zero.
INTERRUPTED_TRANSFER_RESERVE = BLOCK
for name in ("cache", "artifacts", "extensions", "spill"):
    (ROOT / name).mkdir(exist_ok=True)
ledger_path = ROOT / "network.json"
ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {"source_bytes": 0, "requests": 0}
lock = threading.RLock()
started = time.monotonic()
peak_rss = 0
stop_monitor = threading.Event()


def emit(event, **values):
    print(json.dumps({"event": event, **values}, ensure_ascii=False), flush=True)


def save_ledger():
    pending = ledger_path.with_suffix(".json.pending")
    pending.write_text(json.dumps(ledger))
    pending.replace(ledger_path)


def final_progress():
    stop_monitor.set()
    maximum = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform != "darwin":
        maximum *= 1024
    (ROOT / "progress.json").write_text(json.dumps({"pid": os.getpid(),
        "elapsed_seconds": round(time.monotonic() - started), "finished": True,
        "peak_rss_bytes": max(peak_rss, maximum), **ledger}))


atexit.register(final_progress)


def public_read(url, headers=None, expected=None):
    with lock:
        if (ROOT / "STOP").exists():
            raise RuntimeError("Extraction paused by STOP marker; cached data preserved")
        allowance = SOURCE_LIMIT - INTERRUPTED_TRANSFER_RESERVE - ledger["source_bytes"]
        if expected is not None and expected > allowance:
            raise RuntimeError("Public-source byte budget exhausted")
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=90) as response:
            if headers and "Range" in headers and response.status != 206:
                raise RuntimeError("Source did not honor Range; refusing full download")
            length_header = response.headers.get("Content-Length")
            length = int(length_header) if length_header else (expected or min(1_000_000, allowance))
            if length > allowance or (expected is not None and length != expected):
                raise RuntimeError("Unexpected or over-budget source response length")
            chunks = []
            remaining = length
            try:
                while remaining:
                    if (ROOT / "STOP").exists():
                        raise RuntimeError("Extraction paused by STOP marker; cached data preserved")
                    part = response.read(min(1024 * 1024, remaining))
                    if not part:
                        if length_header or expected is not None:
                            raise RuntimeError("Truncated source response")
                        break
                    ledger["source_bytes"] += len(part)
                    save_ledger()
                    chunks.append(part)
                    remaining -= len(part)
            finally:
                ledger["requests"] += 1
                save_ledger()
            return b"".join(chunks)


def monitor():
    global peak_rss
    while not stop_monitor.wait(1):
        rss = int(subprocess.check_output(["ps", "-o", "rss=", "-p", str(os.getpid())]).strip()) * 1024
        peak_rss = max(peak_rss, rss)
        if rss > 950_000_000:
            emit("budget_stop", reason="rss", rss=rss)
            os._exit(92)
        if int(time.monotonic() - started) % 10 == 0:
            allocated = sum(p.stat().st_blocks * 512 for p in ROOT.rglob("*") if p.is_file())
            (ROOT / "progress.json").write_text(json.dumps({"pid": os.getpid(), "elapsed_seconds": round(time.monotonic()-started), "rss_bytes": rss, "peak_rss_bytes": peak_rss, "disk_allocated_bytes": allocated, **ledger}))
            if allocated > 9_500_000_000:
                emit("budget_stop", reason="disk", allocated=allocated)
                os._exit(93)


threading.Thread(target=monitor, daemon=True).start()
manifest_path = ROOT / "manifest.json"
if manifest_path.exists():
    files = json.loads(manifest_path.read_text())
else:
    xml = ET.fromstring(public_read(ORIGIN + "?list-type=2&prefix=" + urllib.parse.quote(PREFIX)))
    ns = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}
    assert xml.find("s:IsTruncated", ns).text == "false"
    files = [{"key": item.find("s:Key", ns).text, "size": int(item.find("s:Size", ns).text)}
             for item in xml.findall("s:Contents", ns)]
    assert len(files) == 8 and sum(f["size"] for f in files) == 4_531_207_040
    manifest_path.write_text(json.dumps(files, indent=2))


def cached_read(index, start, end):
    info = files[index]
    cache_path = ROOT / "cache" / f"{index}.parquet"
    blocks_path = ROOT / "cache" / f"{index}.blocks.json"
    with lock:
        present = set(json.loads(blocks_path.read_text())) if blocks_path.exists() else set()
        fd = os.open(cache_path, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            for block in range(start // BLOCK, end // BLOCK + 1):
                if block in present:
                    continue
                lo = block * BLOCK
                hi = min(lo + BLOCK, info["size"]) - 1
                data = public_read(ORIGIN + info["key"], {"Range": f"bytes={lo}-{hi}"}, hi - lo + 1)
                os.pwrite(fd, data, lo)
                present.add(block)
                blocks_path.write_text(json.dumps(sorted(present)))
            return os.pread(fd, end - start + 1, start)
        finally:
            os.close(fd)


class Gateway(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def answer(self, body):
        match = re.fullmatch(r"/(\d+)\.parquet", self.path)
        if not match or int(match[1]) >= len(files):
            self.send_error(404)
            return
        index = int(match[1])
        size = files[index]["size"]
        start, end = 0, size - 1
        range_header = self.headers.get("Range")
        if range_header:
            match = re.fullmatch(r"bytes=(\d+)-(\d*)", range_header)
            if not match:
                self.send_error(416)
                return
            start, end = int(match[1]), int(match[2]) if match[2] else size - 1
            end = min(end, size - 1)
        self.send_response(206 if range_header else 200)
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Type", "application/octet-stream")
        if range_header:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if body:
            try:
                for lo in range(start, end + 1, BLOCK):
                    self.wfile.write(cached_read(index, lo, min(lo + BLOCK - 1, end)))
            except Exception as error:
                emit("gateway_error", detail=str(error))
                self.close_connection = True

    def do_HEAD(self):
        self.answer(False)

    def do_GET(self):
        self.answer(True)


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Gateway)
threading.Thread(target=server.serve_forever, daemon=True).start()
db = duckdb.connect(config={"memory_limit": "512MB", "threads": "1", "preserve_insertion_order": "false",
    "extension_directory": str(ROOT / "extensions"), "temp_directory": str(ROOT / "spill"),
    "max_temp_directory_size": "500MB", "autoinstall_known_extensions": "false", "autoload_known_extensions": "false"})
for extension in ("httpfs", "spatial"):
    db.execute(f"LOAD {extension}")
emit("setup", duckdb=duckdb.__version__, pid=os.getpid(), source_limit=SOURCE_LIMIT, memory_limit="512MB")

holmdel_path = ROOT / "holmdel-source-proof.json"
if not holmdel_path.exists():
    matches = []
    for index in range(len(files)):
        url = f"http://127.0.0.1:{server.server_port}/{index}.parquet"
        result = db.execute(f"""SELECT id, division_id, names.primary AS name, subtype, country, region,
            is_territorial, ST_Contains(geometry,ST_Point(-74.1725354,40.3768018)) AS contains_public_census_point
            FROM read_parquet('{url}') WHERE country='US' AND region='US-NJ'
            AND lower(names.primary) LIKE '%holmdel%'""")
        columns = [d[0] for d in result.description]
        matches += [dict(zip(columns, row)) for row in result.fetchall()]
        emit("holmdel_probe", index=index, matches=matches, source_bytes=ledger["source_bytes"])
    holmdel_path.write_text(json.dumps(matches, indent=2))

# GeoParquet already stores 2D WKB. Avoid materializing an additional GEOMETRY
# vector and converting it back to WKB; large geometry chunks exceeded memory.
db.execute("SET enable_geoparquet_conversion=false")
for index in range(len(files)):
    out = ROOT / "artifacts" / f"towns-{index}.parquet"
    done = out.with_suffix(".done")
    if done.exists():
        emit("reuse_shard", index=index, bytes=out.stat().st_size)
        continue
    if out.exists():
        preserved = out.with_name(out.name + f".interrupted-{time.time_ns()}")
        out.rename(preserved)
        emit("preserved_incomplete_shard", index=index, path=str(preserved), bytes=preserved.stat().st_size)
    url = f"http://127.0.0.1:{server.server_port}/{index}.parquet"
    query = f"""SELECT id, division_id, names.primary AS name, subtype, country, region,
        bbox.xmin AS xmin, bbox.ymin AS ymin, bbox.xmax AS xmax, bbox.ymax AS ymax,
        geometry AS wkb
        FROM read_parquet('{url}')
        WHERE is_territorial = true AND subtype IN ('locality', 'localadmin')"""
    emit("start_shard", index=index, source_bytes=ledger["source_bytes"])
    db.execute(f"COPY ({query}) TO '{out}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 2048)")
    done.write_text("complete\n")
    emit("shard_done", index=index, bytes=out.stat().st_size, source_bytes=ledger["source_bytes"], peak_rss=peak_rss)

server.shutdown()
if "--extract-only" in sys.argv:
    emit("extraction_complete", shards=len(files), source_bytes=ledger["source_bytes"], peak_rss=peak_rss)
    stop_monitor.set()
    db.close()
    sys.exit(0)
glob = str(ROOT / "artifacts" / "towns-*.parquet")
db.execute(f"CREATE VIEW towns AS SELECT * FROM read_parquet('{glob}')")
def records(sql):
    cursor = db.execute(sql)
    columns = [d[0] for d in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]

report = {
    "release": RELEASE,
    "filter": "is_territorial = true AND subtype IN ('locality', 'localadmin')",
    "artifact_bytes": sum(p.stat().st_size for p in (ROOT / "artifacts").glob("towns-*.parquet")),
    "counts": records("SELECT subtype, count(*) AS rows, count(DISTINCT country) AS countries FROM towns GROUP BY subtype"),
    "quality": records("SELECT count(*) AS rows, count(DISTINCT id) AS unique_area_ids, count(DISTINCT division_id) AS divisions, count(DISTINCT country) AS countries, count(*) FILTER (WHERE name IS NULL OR name = '') AS missing_names, max(octet_length(wkb)) AS max_wkb_bytes, sum(octet_length(wkb)) AS raw_wkb_bytes FROM towns"),
    "country_counts": records("SELECT country, count(*) AS rows FROM towns GROUP BY country ORDER BY country"),
    "holmdel_named": records("SELECT id, division_id, name, subtype, country, region, octet_length(wkb) AS wkb_bytes FROM towns WHERE country='US' AND lower(name) LIKE '%holmdel%'"),
    # Public Census interior point, never a member location.
    "holmdel_public_point": records("SELECT id, name, subtype, country, region FROM towns WHERE xmin <= -74.1725354 AND xmax >= -74.1725354 AND ymin <= 40.3768018 AND ymax >= 40.3768018 AND ST_Contains(ST_GeomFromWKB(wkb), ST_Point(-74.1725354,40.3768018))"),
}
emit("extract_summary", **{k: v for k, v in report.items() if k != "country_counts"})
(ROOT / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))

# Disk-backed deployment candidate: compressed individual WKB blobs + SQLite R-tree.
sqlite_path = ROOT / "artifacts" / "towns.sqlite"
if not sqlite_path.exists():
    sq = sqlite3.connect(sqlite_path)
    sq.executescript("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA cache_size=-4096; PRAGMA temp_store=FILE; CREATE TABLE town(id INTEGER PRIMARY KEY, area_id TEXT, division_id TEXT, name TEXT, subtype TEXT, country TEXT, region TEXT, geometry_zlib BLOB); CREATE VIRTUAL TABLE bounds USING rtree(id,xmin,xmax,ymin,ymax);")
    cursor = db.execute("SELECT id, division_id, name, subtype, country, region, xmin, xmax, ymin, ymax, wkb FROM towns")
    seq = 0
    while True:
        batch = cursor.fetchmany(64)
        if not batch:
            break
        values, bounds = [], []
        for row in batch:
            seq += 1
            values.append((seq, *row[:6], zlib.compress(row[10])))
            bounds.append((seq, *row[6:10]))
        sq.executemany("INSERT INTO town VALUES (?,?,?,?,?,?,?,?)", values)
        sq.executemany("INSERT INTO bounds VALUES (?,?,?,?,?)", bounds)
        sq.commit()
        if seq % 32768 == 0:
            emit("sqlite_progress", rows=seq, bytes=sqlite_path.stat().st_size, peak_rss=peak_rss)
    sq.execute("PRAGMA optimize")
    sq.close()

report["sqlite_bytes"] = sqlite_path.stat().st_size
report["network"] = ledger
report["peak_rss_bytes"] = max(peak_rss, resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
report["disk_allocated_bytes"] = sum(p.stat().st_blocks * 512 for p in ROOT.rglob("*") if p.is_file())
report["elapsed_seconds"] = round(time.monotonic() - started, 2)
(ROOT / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
emit("complete", **{k: v for k, v in report.items() if k not in ("country_counts",)})
stop_monitor.set()
