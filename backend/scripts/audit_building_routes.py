"""Read-only coverage audit for every listed campus origin/destination pair."""
from itertools import product
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.models import Point, Preferences
from app.services.geographic_data import MapData
from app.services.respite import RespiteEngine
from app.services.spot_library import building_library


def audit():
    data = MapData()
    engine = RespiteEngine(data)
    places = building_library(data)
    failures = []
    for start, end in product(places, repeat=2):
        try:
            route = engine.walking_leg(
                Point(lat=start['lat'], lon=start['lon'], name=start['name']),
                Point(lat=end['lat'], lon=end['lon'], name=end['name']), Preferences())
            if start['id'] != end['id'] and route is None:
                raise ValueError('Distinct listed locations cannot claim a zero-distance leg.')
        except ValueError as exc:
            failures.append(f"{start['name']} -> {end['name']}: {exc}")
    print(f"{len(places)} listed places; {len(places)**2 - len(failures)}/{len(places)**2} pairs supported")
    for failure in failures:
        print(failure)
    return not failures


if __name__ == '__main__':
    sys.exit(0 if audit() else 1)
