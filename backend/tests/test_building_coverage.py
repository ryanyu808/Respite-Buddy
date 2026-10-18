import sys
from itertools import product
from pathlib import Path
import networkx as nx
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.models import Point, Preferences
from app.services.geographic_data import MapData, meters
from app.services.respite import RespiteEngine
from app.services.spot_library import building_library


@pytest.fixture(scope='module')
def data():
    return MapData()


def test_every_listed_origin_destination_pair_has_a_real_route(data):
    engine = RespiteEngine(data)
    locations = building_library(data)
    assert len(locations) >= 13
    for start, end in product(locations, repeat=2):
        a = Point(lat=start['lat'], lon=start['lon'], name=start['name'])
        b = Point(lat=end['lat'], lon=end['lon'], name=end['name'])
        result = engine.walking_leg(a, b, Preferences())
        if a.lat == b.lat and a.lon == b.lon:
            assert result is None
            continue
        assert result and result.routes
        assert result.origin_snap_m <= 120 and result.destination_snap_m <= 120
        for route in result.routes:
            assert route.distance_m > 0 and len(route.geometry.coordinates) >= 2
            assert route.geometry.coordinates[0] == [result.snapped_origin.lon, result.snapped_origin.lat]
            assert route.geometry.coordinates[-1] == [result.snapped_destination.lon, result.snapped_destination.lat]


def test_known_building_adjustments_keep_coordinates_and_disclose_offsets(data):
    main = max(nx.connected_components(data.graph), key=len)
    for code in ['usc-jkp', 'usc-thh', 'way-154906727']:
        place = next(p for p in building_library(data) if p['id'] == code)
        node, distance = data.nearest(place['lat'], place['lon'])
        assert node in main and 0 < distance <= 120
        assert data.anchor_note(place['lat'], place['lon'])
        # This is an existing graph node, not a fabricated connector or entrance.
        point = data.graph.nodes[node]
        assert distance == meters(place['lat'], place['lon'], point['y'], point['x'])


def test_unregistered_points_still_use_their_actual_nearest_fragment(data):
    # Do not globally pretend every disconnected GPS/map point is a building.
    small = next(c for c in nx.connected_components(data.graph) if len(c) == 2)
    node = next(iter(small))
    point = data.graph.nodes[node]
    selected, distance = data.nearest(point['y'], point['x'])
    assert selected == node and distance == 0
    assert data.anchor_note(point['y'], point['x']) is None


def test_invalid_optional_registry_does_not_disable_the_walking_graph(monkeypatch):
    from app.services import spot_library
    monkeypatch.setattr(spot_library, 'building_library', lambda _: (_ for _ in ()).throw(ValueError('bad registry')))
    data = MapData()
    assert data.graph is not None and data.metadata['available']
    assert any('anchors are unavailable' in note for note in data.metadata['notes'])
