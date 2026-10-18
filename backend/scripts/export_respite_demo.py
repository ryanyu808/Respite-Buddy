"""Reproducible saved demos from the shared engine, using real snapshot routes."""
import json
import sys
from itertools import combinations
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.geographic_data import MapData
from app.services.respite import RespiteEngine
from app.respite_models import ResetRequest
from app.models import Point, Preferences
from app.services.spot_library import building_library, demo_library

OUT = Path(__file__).resolve().parents[2] / 'frontend' / 'src' / 'data' / 'respite-demo.json'
LEGS_OUT = OUT.with_name('demo-route-legs.json')


def build_legs(engine):
    """Each directed leg is calculated once by the real router, never reversed/guessed."""
    locations = building_library(engine.data)
    spots = demo_library(engine.data, indoor=True, expanded=True)
    legs = {}
    for location in locations:
        point = Point(lat=location['lat'], lon=location['lon'], name=location['name'])
        legs[location['id']] = {}
        for spot in spots:
            target = Point(lat=spot.lat, lon=spot.lng, name=spot.name)
            paths = {}
            for direction, origin, destination in [('outward', point, target), ('onward', target, point)]:
                try:
                    route = engine.walking_leg(origin, destination, Preferences())
                    paths[direction] = route.model_dump(mode='json') if route else None
                except ValueError:
                    # Missing path is distinct from a genuine zero-distance leg.
                    continue
            legs[location['id']][spot.id] = paths
    return {'locations': locations, 'legs': legs, 'spots': [spot.model_dump(mode='json') for spot in spots],
            'provenance': 'Directed walking legs from the real snapshot and unchanged router, with default walking preferences. Missing legs are not routable. Null legs mean exactly coincident building anchors, not indoor directions.'}


def build(engine=None):
    engine = engine or RespiteEngine(MapData())
    scenarios = []
    supported = ['quiet','seated','dim','few_people']
    need_sets = [list(group) + setting for size in range(5)
                 for group in combinations(supported,size) for setting in [[],['indoor'],['outdoor']]]
    # One route seed per compatible preference combination supports all selected
    # time windows (and older duration links), without duplicating each geometry.
    for minutes in [15,240]:
        for needs in need_sets:
            if minutes == 15 and needs:
                continue
            for next_class in [None,'TCC']:
                request = ResetRequest(demo=True, minutes=minutes, needs=needs, next_class=next_class)
                scenarios.append({'request': request.model_dump(mode='json'),
                                  'response': engine.recommend(request).model_dump(mode='json')})
    default = next(s for s in scenarios if s['request']['minutes'] == 15 and not s['request']['needs'] and s['request']['next_class'] is None and s['request']['demo_time'] is None)
    return {**default, 'scenarios': scenarios,
            'provenance': 'Real OSM coordinates and engine-computed routes. Demo spot attributes are simulated. No crowd observations.'}


if __name__ == '__main__':
    engine = RespiteEngine(MapData())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(build(engine), separators=(',',':')) + '\n', encoding='utf-8')
    LEGS_OUT.write_text(json.dumps(build_legs(engine), separators=(',',':')) + '\n', encoding='utf-8')
    print(f'Wrote {OUT} ({OUT.stat().st_size // 1024} KB)')
    print(f'Wrote {LEGS_OUT} ({LEGS_OUT.stat().st_size // 1024} KB)')
