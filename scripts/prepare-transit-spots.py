#!/usr/bin/env python3
"""Prepare public GTFS station/stop records for review; never mutate a database.

Input archives and download manifests stay outside Git. Stop IDs and official
parent/complex IDs define identity. Name similarity and proximity do not merge
stops. A separate reviewed mapping must associate these records with existing
cruush Spot IDs before import.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import re
from collections import defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile


def miles(latitude, longitude, center=(40.7128, -74.006)):
    lat1, lat2 = map(math.radians, (latitude, center[0]))
    dlat = lat2 - lat1
    dlon = math.radians(longitude - center[1])
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 3958.7613 * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0, 1 - a)))


def clean(value):
    return (value or '').strip()


def https_url(value):
    value = clean(value)
    parsed = urlsplit(value)
    if parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password:
        return value
    return None


def operator_stop_url(value, agencies):
    url = https_url(value)
    if not url:
        return None
    hostname = urlsplit(url).hostname.removeprefix('www.')
    for agency in agencies.values():
        operator_host = (urlsplit(clean(agency.get('agency_url'))).hostname or '').removeprefix('www.')
        if operator_host and (hostname == operator_host or hostname.endswith('.' + operator_host)):
            return url
    return None


def rows(archive, filename):
    names = [n for n in archive.namelist() if n.rsplit('/', 1)[-1].lower() == filename and not n.startswith('__MACOSX/')]
    if not names:
        return
    if len(names) != 1:
        raise ValueError(f'Ambiguous GTFS member: {filename}')
    with archive.open(names[0]) as raw:
        for row in csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig')):
            yield {clean(k): clean(v) for k, v in row.items() if k is not None}


def point_in_ring(x, y, ring):
    inside = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = previous[:2]
        x2, y2 = current[:2]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
        previous = current
    return inside


def borough_polygons(geojson):
    result = []
    for feature in geojson['features']:
        geometry = feature['geometry']
        for rings in geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]:
            xs, ys = zip(*[(p[0], p[1]) for p in rings[0]])
            result.append(((min(xs), min(ys), max(xs), max(ys)), rings))
    return result


def in_nyc(latitude, longitude, polygons):
    for (west, south, east, north), rings in polygons:
        if west <= longitude <= east and south <= latitude <= north:
            if point_in_ring(longitude, latitude, rings[0]) and not any(point_in_ring(longitude, latitude, hole) for hole in rings[1:]):
                return True
    return False


def mode(route_type):
    try:
        value = int(route_type)
    except (TypeError, ValueError):
        return None
    if value in (0, 1, 2, 5, 12) or 100 <= value < 200 or 400 <= value < 500 or 900 <= value < 1000:
        return 'rail_station'
    if value in (3, 11) or 200 <= value < 300 or 700 <= value < 900:
        return 'bus_stop'
    return None


def active_services(archive, today):
    calendar = list(rows(archive, 'calendar.txt'))
    exceptions = list(rows(archive, 'calendar_dates.txt'))
    if not calendar and not exceptions:
        return None
    return {r['service_id'] for r in calendar if r.get('end_date', '') >= today} | {
        r['service_id'] for r in exceptions if r.get('date', '') >= today and r.get('exception_type') == '1'
    }


def complex_lookup(records):
    return {stop_id.strip(): record for record in records for stop_id in re.split(r'[;,]', record['gtfs_stop_ids'])}


def prepare_feed(archive, feed, today, complexes, stations, polygons):
    stops = {r['stop_id']: r for r in rows(archive, 'stops.txt')}
    routes = {r['route_id']: r for r in rows(archive, 'routes.txt') if mode(r.get('route_type'))}
    agencies = {r.get('agency_id', ''): r for r in rows(archive, 'agency.txt')}
    allowed_services = active_services(archive, today)
    trips = {r['trip_id']: r for r in rows(archive, 'trips.txt')
             if r.get('route_id') in routes and (allowed_services is None or r.get('service_id') in allowed_services)}
    directions = {(r.get('route_id'), r.get('direction_id')): r.get('direction', '') for r in rows(archive, 'directions.txt')}
    warnings = []
    if allowed_services == set():
        warnings.append('No current or upcoming service in downloaded feed; coverage unresolved.')
    elif allowed_services is None:
        warnings.append('No calendar validity supplied; service currency needs verification.')

    def parent(stop_id):
        seen = set()
        while stop_id in stops and stops[stop_id].get('parent_station'):
            if stop_id in seen:
                raise ValueError(f'Parent cycle in {feed["id"]}: {stop_id}')
            seen.add(stop_id)
            stop_id = stops[stop_id]['parent_station']
        return stop_id

    local = {}
    for stop_id, stop in stops.items():
        parent_id = parent(stop_id)
        source = stops.get(parent_id, stop)
        try:
            latitude, longitude = float(source['stop_lat']), float(source['stop_lon'])
        except (KeyError, ValueError):
            continue
        if math.isfinite(latitude) and math.isfinite(longitude) and miles(latitude, longitude) <= 100:
            local[stop_id] = (parent_id, source, latitude, longitude)

    # Keep only calls within the circle. Retain headsign changes and trip terminal
    # identity separately, never a user-facing list of intermediate route stops.
    calls = defaultdict(set)
    stop_headsigns = {}
    terminals = {}
    for row in rows(archive, 'stop_times.txt'):
        trip_id = row.get('trip_id')
        if trip_id not in trips:
            continue
        sequence = int(row['stop_sequence'])
        stop_id = row.get('stop_id')
        if sequence > terminals.get(trip_id, (-1, ''))[0]:
            terminals[trip_id] = (sequence, stop_id)
        if row.get('stop_headsign'):
            stop_headsigns[(trip_id, sequence)] = row['stop_headsign']
        if stop_id in local and not (row.get('pickup_type') == '1' and row.get('drop_off_type') == '1'):
            calls[stop_id].add((trip_id, sequence, row.get('pickup_type') != '1'))

    entrances_by_parent = defaultdict(list)
    for entrance_id, entrance in stops.items():
        if entrance.get('location_type') == '2':
            item = {'name': entrance.get('stop_name', ''), 'sourceUrl': feed['url']}
            if entrance.get('stop_lat') and entrance.get('stop_lon'):
                item.update(latitude=float(entrance['stop_lat']), longitude=float(entrance['stop_lon']))
            entrances_by_parent[parent(entrance_id)].append(item)

    output = {}
    for stop_id, stop_calls in calls.items():
        parent_id, stop, latitude, longitude = local[stop_id]
        complex_record = complexes.get(parent_id) if feed['id'] == 'mta-subway' else None
        namespace = 'mta-bus' if feed['id'] in {'mta-b', 'mta-bx', 'mta-m', 'mta-q', 'mta-si', 'mta-busco'} else feed['id']
        identity = f'{namespace}:{parent_id}'
        name = stop.get('stop_name', '')
        if complex_record:
            identity = f'mta-subway:complex:{complex_record["complex_id"]}'
            name = complex_record['stop_name']
            latitude, longitude = float(complex_record['latitude']), float(complex_record['longitude'])
        if not name:
            warnings.append(f'Unnamed stop {stop_id}; not importable.')
            continue
        record = output.setdefault(identity, {
            'key': identity, 'name': name, 'latitude': latitude, 'longitude': longitude,
            'sourceKeys': set(), 'sources': [], 'services': {}, 'modes': set(),
            'scheduleLinks': {}, 'entrances': [], 'operatorUrls': set(),
        })
        record['sourceKeys'].add(f'{namespace}:{stop_id}')
        record['sourceKeys'].add(f'{namespace}:{parent_id}')
        record['sourceKeys'].add(identity)
        source_evidence = {'feed': feed['id'], 'url': feed['url'], 'sha256': feed['sha256']}
        if source_evidence not in record['sources']:
            record['sources'].append(source_evidence)
        # A GTFS stop_url may point to a nearby business or Google Maps rather
        # than operator transit information. Never present those as schedules.
        stop_url = operator_stop_url(stop.get('stop_url'), agencies)
        if stop_url:
            record['scheduleLinks'][stop_url] = 'Station schedule' if any(mode(routes[trips[t]['route_id']]['route_type']) == 'rail_station' for t, _, _ in stop_calls) else 'Stop schedule'
        for trip_id, sequence, can_board in stop_calls:
            trip = trips[trip_id]
            route_id = trip['route_id']
            route = routes[route_id]
            record['modes'].add(mode(route['route_type']))
            agency = agencies.get(route.get('agency_id', ''), next(iter(agencies.values()), {}))
            operator = agency.get('agency_name') or feed.get('provider') or namespace
            if https_url(agency.get('agency_url')):
                record['operatorUrls'].add(agency['agency_url'])
            # Regional rail feeds often put internal abbreviations in the short
            # field (RARV, BNTNM, PAO). Their long names are the line names on signs.
            named_rail = route.get('route_type') == '2' or feed['id'] == 'njt-rail'
            # Some coach feeds repeat the operator in route_short_name. Keeping
            # that value would collapse distinct bus lines into one service.
            operator_as_short_name = clean(route.get('route_short_name')).casefold() == operator.casefold()
            route_name = ((route.get('route_long_name') or route.get('route_short_name')) if named_rail or operator_as_short_name
                          else (route.get('route_short_name') or route.get('route_long_name')))
            if feed['id'] == 'mta-subway' and route_name in {'6X', '7X', 'FX'}:
                # MTA identifies these as express services in route_long_name
                # and route_desc; the trailing X is a feed identifier.
                route_name = f'{route_name[:-1]} Express'
            if not route_name:
                warnings.append(f'Route {route_id} has no passenger-facing name.')
                continue
            # GTFS stop_headsign applies only to this call, never subsequent calls.
            destination = stop_headsigns.get((trip_id, sequence), trip.get('trip_headsign', ''))
            if not destination:
                destination = stops.get(terminals.get(trip_id, (0, ''))[1], {}).get('stop_name', '')
            direction = directions.get((route_id, trip.get('direction_id')), '')
            # MTA publishes actual platform signage labels separately from GTFS.
            if feed['id'] == 'mta-subway' and parent_id in stations and stop_id.endswith(('N', 'S')):
                direction = stations[parent_id].get('north_direction_label' if stop_id.endswith('N') else 'south_direction_label', '')
            service_key = (operator, route_name, direction)
            service = record['services'].setdefault(service_key, {'operator': operator, 'route': route_name, 'direction': direction, 'destinations': set()})
            # An arrival-only terminal still serves its line, but advertising an
            # onward destination there would be misleading.
            if destination and can_board and sequence < terminals[trip_id][0]:
                service['destinations'].add(destination)
            route_url = operator_stop_url(route.get('route_url'), {'operator': agency})
            if route_url:
                record['scheduleLinks'].setdefault(route_url, f'{route_name} schedule')
        if namespace == 'mta-bus' and in_nyc(latitude, longitude, polygons):
            code = stop.get('stop_code') or parent_id
            if len(code) == 6 and code.isdigit():
                record['sms'] = {'operator': 'mta-bus', 'locality': 'nyc', 'stopCode': code}
        for entrance in entrances_by_parent[parent_id]:
            if entrance not in record['entrances']:
                record['entrances'].append(entrance)
    return list(output.values()), {'feed': feed['id'], 'stopsInCircle': len(local), 'parentRecords': len(output), 'warnings': sorted(set(warnings))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, required=True)
    parser.add_argument('--date', default=date.today().strftime('%Y%m%d'))
    args = parser.parse_args()
    directory = args.data_dir
    feeds = json.loads((directory / 'core-downloads.json').read_text()) + json.loads((directory / 'regional-downloads.json').read_text())
    if (directory / 'additional-downloads.json').exists():
        feeds.extend(json.loads((directory / 'additional-downloads.json').read_text()))
    complex_rows = json.loads((directory / 'mta-complexes.json').read_text())
    complexes = complex_lookup(complex_rows)
    stations = {r['gtfs_stop_id']: r for r in json.loads((directory / 'mta-stations.json').read_text())}
    polygons = borough_polygons(json.loads((directory / 'nyc-boroughs.geojson').read_text()))
    output, report, hashes = {}, [], {}
    for feed in feeds:
        try:
            file = directory / f'{feed["id"]}.zip'
            digest = hashlib.sha256(file.read_bytes()).hexdigest()
            if digest != feed['sha256']:
                raise ValueError('Download checksum mismatch')
            if digest in hashes:
                report.append({'feed': feed['id'], 'identicalTo': hashes[digest]})
                continue
            hashes[digest] = feed['id']
            with ZipFile(file) as outer:
                nested = [n for n in outer.namelist() if n.endswith('.zip')]
                archives = [(feed, outer)] if not nested else [({**feed, 'id': f'{feed["id"]}/{n[:-4]}'}, ZipFile(io.BytesIO(outer.read(n)))) for n in nested]
                for part, archive in archives:
                    records, summary = prepare_feed(archive, part, args.date, complexes, stations, polygons)
                    report.append(summary)
                    for record in records:
                        key = record['key']
                        if key not in output:
                            output[key] = record
                            continue
                        previous = output[key]
                        if miles(record['latitude'], record['longitude'], (previous['latitude'], previous['longitude'])) > 0.01:
                            previous.setdefault('reviewIssues', []).append({
                                'reason': 'Official feeds disagree on shared stop coordinates',
                                'feed': part['id'], 'latitude': record['latitude'], 'longitude': record['longitude'],
                            })
                        previous['sourceKeys'].update(record['sourceKeys'])
                        previous['sources'].extend(s for s in record['sources'] if s not in previous['sources'])
                        previous['modes'].update(record['modes'])
                        previous['scheduleLinks'].update(record['scheduleLinks'])
                        for service_key, service in record['services'].items():
                            if service_key in previous['services']:
                                previous['services'][service_key]['destinations'].update(service['destinations'])
                            else:
                                previous['services'][service_key] = service
                    print(json.dumps(summary), flush=True)
        except Exception as error:
            report.append({'feed': feed['id'], 'error': str(error)})
            print(json.dumps(report[-1]), flush=True)
        (directory / 'preparation-report.json').write_text(json.dumps(report, indent=2))
    serializable = []
    for record in output.values():
        record['sourceKeys'] = sorted(record['sourceKeys'])
        record['modes'] = sorted(record['modes'])
        record['operatorUrls'] = sorted(record['operatorUrls'])
        record['scheduleLinks'] = [{'label': label, 'url': url} for url, label in sorted(record['scheduleLinks'].items())]
        record['services'] = [{**service, 'destinations': sorted(service['destinations'])} for _, service in sorted(record['services'].items())]
        serializable.append(record)
    (directory / 'prepared-stops.json').write_text(json.dumps(serializable, ensure_ascii=False, indent=2))
    print(f'Prepared {len(serializable)} parent records; no database writes.', flush=True)


if __name__ == '__main__':
    main()
