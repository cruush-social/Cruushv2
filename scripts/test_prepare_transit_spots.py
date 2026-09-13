import csv
import importlib.util
import io
import unittest
from pathlib import Path
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location('prepare_transit_spots', Path(__file__).with_name('prepare-transit-spots.py'))
transit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transit)


def feed_archive(tables):
    content = io.BytesIO()
    with ZipFile(content, 'w') as archive:
        for name, rows in tables.items():
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
            archive.writestr(name, output.getvalue())
    content.seek(0)
    return ZipFile(content)


class TransitPreparationTests(unittest.TestCase):
    def setUp(self):
        self.feed = {'id': 'sample', 'url': 'https://operator.example/gtfs.zip', 'sha256': '0' * 64}
        self.tables = {
            'agency.txt': [{'agency_id': 'agency', 'agency_name': 'Operator', 'agency_url': 'https://operator.example'}],
            'routes.txt': [{'route_id': 'route', 'route_short_name': 'Q', 'route_type': '3', 'agency_id': 'agency'}],
            'trips.txt': [
                {'trip_id': 'out', 'route_id': 'route', 'service_id': 'current', 'direction_id': '0', 'trip_headsign': 'Downtown Terminal'},
                {'trip_id': 'back', 'route_id': 'route', 'service_id': 'current', 'direction_id': '1', 'trip_headsign': 'Harbor'},
            ],
            'calendar_dates.txt': [{'service_id': 'current', 'date': '20260912', 'exception_type': '1'}],
            'stops.txt': [
                {'stop_id': 'north', 'stop_name': 'Same Avenue', 'stop_lat': '40.7', 'stop_lon': '-74', 'parent_station': '', 'location_type': '0'},
                {'stop_id': 'south', 'stop_name': 'Same Avenue', 'stop_lat': '40.7001', 'stop_lon': '-74', 'parent_station': '', 'location_type': '0'},
                {'stop_id': 'terminal', 'stop_name': 'Terminal', 'stop_lat': '40.71', 'stop_lon': '-74', 'parent_station': '', 'location_type': '0'},
            ],
            'stop_times.txt': [
                {'trip_id': 'out', 'stop_id': 'north', 'stop_sequence': '1', 'stop_headsign': ''},
                {'trip_id': 'out', 'stop_id': 'terminal', 'stop_sequence': '2', 'stop_headsign': ''},
                {'trip_id': 'back', 'stop_id': 'south', 'stop_sequence': '1', 'stop_headsign': ''},
                {'trip_id': 'back', 'stop_id': 'terminal', 'stop_sequence': '2', 'stop_headsign': ''},
            ],
        }

    def prepare(self):
        with feed_archive(self.tables) as archive:
            rows, _ = transit.prepare_feed(archive, self.feed, '20260912', {}, {}, [])
        return {row['key']: row for row in rows}

    def test_same_name_opposite_stops_keep_official_destinations_without_invented_directions(self):
        records = self.prepare()
        for key, destination in [('sample:north', 'Downtown Terminal'), ('sample:south', 'Harbor')]:
            service = next(iter(records[key]['services'].values()))
            self.assertEqual(service['direction'], '')
            self.assertEqual(service['destinations'], {destination})
        self.assertNotEqual(records['sample:north']['sourceKeys'], records['sample:south']['sourceKeys'])

    def test_call_headsign_does_not_leak_into_later_stops(self):
        self.tables['stop_times.txt'] = [
            {'trip_id': 'out', 'stop_id': 'north', 'stop_sequence': '1', 'stop_headsign': 'Branch Terminal'},
            {'trip_id': 'out', 'stop_id': 'south', 'stop_sequence': '2', 'stop_headsign': ''},
            {'trip_id': 'out', 'stop_id': 'terminal', 'stop_sequence': '3', 'stop_headsign': ''},
        ]
        records = self.prepare()
        self.assertEqual(next(iter(records['sample:north']['services'].values()))['destinations'], {'Branch Terminal'})
        self.assertEqual(next(iter(records['sample:south']['services'].values()))['destinations'], {'Downtown Terminal'})

    def test_platforms_and_entrances_stay_under_one_station_and_circle_excludes_distant_stops(self):
        self.tables['routes.txt'][0].update(route_type='2', route_short_name='RARV', route_long_name='Raritan Valley Line')
        self.tables['stops.txt'][2]['stop_lat'] = '45'
        self.tables['stops.txt'] += [
            {'stop_id': 'station', 'stop_name': 'Parent Station', 'stop_lat': '40.7', 'stop_lon': '-74', 'parent_station': '', 'location_type': '1'},
            {'stop_id': 'entrance', 'stop_name': 'East side of Same Avenue', 'stop_lat': '40.7', 'stop_lon': '-74', 'parent_station': 'station', 'location_type': '2'},
        ]
        for row in self.tables['stops.txt'][:2]:
            row['parent_station'] = 'station'
        records = self.prepare()
        self.assertEqual(list(records), ['sample:station'])
        self.assertEqual(records['sample:station']['name'], 'Parent Station')
        self.assertEqual(next(iter(records['sample:station']['services'].values()))['route'], 'Raritan Valley Line')
        self.assertEqual(len(records['sample:station']['entrances']), 1)
        self.assertEqual(next(iter(records['sample:station']['services'].values()))['destinations'], {'Downtown Terminal', 'Harbor'})

    def test_official_complex_semicolon_ids_share_one_parent(self):
        complex_record = {'gtfs_stop_ids': '132; D19; L02', 'complex_id': '601'}
        lookup = transit.complex_lookup([complex_record])
        self.assertEqual(set(lookup), {'132', 'D19', 'L02'})
        self.assertTrue(all(value is complex_record for value in lookup.values()))

    def test_unrelated_stop_websites_are_not_presented_as_operator_schedules(self):
        agencies = {'agency': {'agency_url': 'http://www.operator.example'}}
        self.assertEqual(transit.operator_stop_url('https://times.operator.example/stop/1', agencies),
                         'https://times.operator.example/stop/1')
        for url in ['https://www.google.com/maps/place/stop', 'https://retirement.example',
                    'https://operator.example.unrelated.example/stop/1']:
            self.assertIsNone(transit.operator_stop_url(url, agencies))

    def test_operator_named_short_fields_do_not_collapse_distinct_bus_routes(self):
        self.tables['routes.txt'] = [
            {'route_id': 'route', 'route_short_name': 'Operator', 'route_long_name': '77 Local', 'route_type': '3', 'agency_id': 'agency'},
            {'route_id': 'express', 'route_short_name': 'Operator', 'route_long_name': '77X Express', 'route_type': '3', 'agency_id': 'agency'},
        ]
        self.tables['trips.txt'][1]['route_id'] = 'express'
        records = self.prepare()
        self.assertEqual(
            {service['route'] for service in records['sample:terminal']['services'].values()},
            {'77 Local', '77X Express'},
        )

    def test_route_schedules_link_only_to_the_serving_operator(self):
        route = self.tables['routes.txt'][0]
        route['route_url'] = 'https://tracker.example/operator/route/Q'
        self.assertFalse(self.prepare()['sample:north']['scheduleLinks'])
        route['route_url'] = 'https://operator.example/schedules/Q'
        self.assertEqual(self.prepare()['sample:north']['scheduleLinks'],
                         {'https://operator.example/schedules/Q': 'Q schedule'})


if __name__ == '__main__':
    unittest.main()
