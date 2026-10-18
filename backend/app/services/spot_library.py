"""Validated scout imports. No defaults for unknown campus conditions."""
import json
from pathlib import Path
from pydantic import TypeAdapter
from ..respite_models import Spot

SPOT_FILE = Path(__file__).resolve().parents[2] / 'data' / 'respite-spots.json'
BUILDING_FILE = SPOT_FILE.with_name('buildings.json')


def building_library(data):
    aliases = {'Leavey Library':['Leavey','LV','LVL'], 'Tutor Campus Center':['TCC'],
               'USC Village':['Village'], 'USC Fisher Museum':['Fisher']}
    locations = [{**p, 'source_url': p['osm_url'], 'aliases': aliases.get(p['name'], [])} for p in data.locations]
    # Curated coordinates from a cited campus primary source, not a geocoder guess.
    for record in json.loads(BUILDING_FILE.read_text(encoding='utf-8')):
        from ..models import Point
        Point(lat=record['lat'], lon=record['lon'], name=record['name'])
        locations.append({**record, 'osm_url': None})
    # Additional evidence-backed building anchors live beside the directory.
    extra_file = BUILDING_FILE.with_name('campus-buildings.json')
    if extra_file.exists():
        for record in json.loads(extra_file.read_text(encoding='utf-8')):
            if not any(p['id'] == record['id'] for p in locations):
                Point(lat=record['lat'], lon=record['lon'], name=record['name'])
                locations.append({**record, 'osm_url': None})
    return locations


def validate_library(raw):
    spots = TypeAdapter(list[Spot]).validate_python(raw)
    ids = [spot.id for spot in spots]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate spot ids. Every spot needs a stable unique id.')
    return spots


def load_library(path=SPOT_FILE):
    return validate_library(json.loads(path.read_text(encoding='utf-8')))


def demo_library(data, indoor=False, expanded=False):
    """Synthetic attributes on real OSM coordinates; never a scout observation."""
    by_name = {spot['name']: spot for spot in data.stops}
    spots = []
    names = ['Alumni Park', 'Hutton Park', 'Associates Park']
    if expanded:
        names += ['McCarthy Quad', 'W. M. Keck Foundation Amphitheatre',
                  'Richardson Family Park', 'Great Lawn', 'Parkside Field']
    for name in names:
        mapped = by_name.get(name)
        if not mapped:
            continue
        raw = {key: None for key in Spot.model_fields}
        raw.update(id=f'demo-{mapped["id"]}', name=f'{name} (sample)',
                   lat=mapped['lat'], lng=mapped['lon'], source_url=mapped['osm_url'],
                   data_kind='illustrative', purpose='general', indoor=False,
                   hours={day: [{'start': '07:00', 'end': '19:00'}] for day in ['mon','tue','wed','thu','fri','sat','sun']},
                   access='open', noise='low', lighting='dim' if name == 'Alumni Park' else 'medium', seating='hard',
                   typical_crowd='few',
                   # No crowd observations, verification, or accessibility fabricated.
                   notes='DEMO ONLY: real OSM position; hours, access, noise, lighting, seating and crowd levels are simulated, not verified campus conditions.')
        spots.append(Spot.model_validate(raw))
    if indoor:
        from .campus_directory import candidates
        indoor_ids = ['lvl-weingart', 'dml-times', 'kortschak-quiet']
        if expanded:
            indoor_ids += ['thh-lounge4', 'rgl-lounge1']
        for candidate in candidates():
            if candidate.id not in indoor_ids:
                continue
            raw = {key: None for key in Spot.model_fields}
            raw.update(id=f'demo-{candidate.id}', name=f'{candidate.building}: {candidate.name} (sample)',
                       building=candidate.building, building_code=candidate.building_code,
                       floor=candidate.floor, lat=candidate.lat, lng=candidate.lng,
                       source_url=candidate.source_url, indoor=True, data_kind='illustrative',
                       purpose='general', access='open', noise='low', lighting='dim', seating='hard', typical_crowd='few',
                       hours={day:[{'start':'07:00','end':'19:00'}] for day in ['mon','tue','wed','thu','fri','sat','sun']},
                       notes='DEMO ONLY: documented indoor place at an approximate building anchor. Access, hours, noise, lighting, seating and crowd levels are simulated, not verified conditions. Indoor walking and entrance time are excluded.')
            spots.append(Spot.model_validate(raw))
    return spots
