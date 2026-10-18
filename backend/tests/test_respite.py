import json
import sys
from pathlib import Path
from datetime import datetime, timedelta
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app
from app.models import Point
from app.respite_models import ResetRequest, SwapRequest, PlanDayRequest, Spot
from app.services.respite import RespiteEngine, DEMO_TIME, open_until
from app.services.spot_library import demo_library, validate_library
from app.services.geographic_data import MapData


@pytest.fixture(scope='module')
def engine():
    return RespiteEngine(MapData())


def scouted(engine, **changes):
    data = demo_library(engine.data)[0].model_dump()
    data.update(data_kind='scouted', verified_by='Test fixture only', verified_date='2026-10-01')
    data.update(changes)
    return Spot.model_validate(data)


def test_schema_required_unknown_and_duplicate(engine):
    with pytest.raises(ValidationError):
        Spot.model_validate({'name': 'Incomplete'})
    spot = scouted(engine)
    assert spot.step_free is None
    with pytest.raises(ValueError, match='Duplicate'):
        validate_library([spot.model_dump(), spot.model_dump()])
    with pytest.raises(ValidationError):
        scouted(engine, access='probably')
    with pytest.raises(ValidationError):
        scouted(engine, verified_by=None)
    with pytest.raises(ValidationError):
        scouted(engine, lat=0)
    with pytest.raises(ValidationError):
        scouted(engine, source_url='javascript:alert(1)')


def test_published_schema_template_and_illustrative_example_match_contract():
    from jsonschema import Draft202012Validator
    directory = Path(__file__).resolve().parents[1] / 'data'
    schema = json.loads((directory / 'respite-spots.schema.json').read_text(encoding='utf-8'))
    assert {k:v for k,v in schema.items() if k != '$schema'} == Spot.model_json_schema()
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    example = json.loads((directory / 'respite-spots.illustrative-example.json').read_text(encoding='utf-8'))[0]
    assert validator.is_valid(example)
    assert Spot.model_validate(example).verified_by is None
    blank = json.loads((directory / 'respite-spots.scouting-template.json').read_text(encoding='utf-8'))[0]
    assert set(Spot.model_fields) == set(blank)
    assert blank['lat'] is None and blank['verified_by'] is None
    assert not validator.is_valid(blank), 'Blank template must never be silently imported as a real spot.'


def test_unknown_verification_and_missing_hours_excluded(engine):
    for change in [dict(verified_by=None,verified_date=None),dict(hours=None),dict(access=None),dict(access='restricted'),dict(purpose='prayer'),dict(purpose='lactation'),dict(name='Prayer room')]:
        local = RespiteEngine(engine.data, [scouted(engine, **change)])
        assert local.recommend(ResetRequest(now=DEMO_TIME)).recommendations == []


def test_lookup_and_invalid_requests(engine):
    assert engine.resolve('Leavey').name == 'Leavey Library'
    assert engine.resolve('TCC').name == 'Tutor Campus Center'
    assert engine.resolve('JKP').lat == 34.018379
    assert engine.resolve('Popovich Hall').lon == -118.282324
    with pytest.raises(ValueError, match='verified lookup'):
        engine.resolve('Imaginary Hall')
    assert engine.resolve('34.02,-118.286').lat == 34.02
    for payload in [{'minutes':0},{'minutes':241},{'needs':['unknown']},{'needs':['indoor','outdoor']},{'demo_time':DEMO_TIME},{'now':'2026-10-19T13:00:00'}]:
        with pytest.raises(ValidationError):
            ResetRequest.model_validate(payload)


def test_demo_deterministic_and_two_real_routing_legs(engine):
    request = ResetRequest(demo=True, next_class='Tutor Campus Center', minutes=20)
    a = engine.recommend(request)
    b = engine.recommend(request)
    assert a == b
    assert len(a.recommendations) == 3
    assert [r.rest_min for r in a.recommendations] == sorted([r.rest_min for r in a.recommendations], reverse=True)
    for r in a.recommendations:
        assert r.rest_min == 20 - r.walk_to_min - r.walk_to_class_min
        assert r.route_to_spot.routes and r.route_to_class.routes
        assert {'fastest','balanced','calmer'} == {role for route in r.route_to_spot.routes for role in route.roles}
        assert r.leave_by == a.evaluated_at + timedelta(minutes=20-r.walk_to_class_min)
        assert r.crowd.category is None and r.crowd.source is None
        assert r.spot.verified_by is None
        assert r.backup_id != r.spot.id
        assert '?to=' in r.deep_link and 'demo=1' in r.deep_link
        assert 'next=' in r.deep_link
        assert 'Tutor' not in r.deep_link


def test_unknown_next_class_provisional_and_tight_time(engine):
    result = engine.recommend(ResetRequest(demo=True, minutes=10))
    assert result.recommendations
    assert any(r.tight_on_time for r in result.recommendations)
    for r in result.recommendations:
        assert r.walk_to_class_min is None
        assert r.route_to_class is None
        assert r.rest_min > 0
    assert any('provisional' in n for n in result.notes)
    assert not engine.recommend(ResetRequest(demo=True,minutes=1)).recommendations


def test_visible_demo_preferences_never_claim_verified_crowd_observations(engine):
    for setting in ['indoor', 'outdoor']:
        result = engine.recommend(ResetRequest(demo=True, next_class='TCC', minutes=105,
                                               needs=[setting,'quiet','seated','dim','few_people']))
        assert result.recommendations
        for item in result.recommendations:
            assert item.spot.data_kind == 'illustrative'
            assert item.spot.lighting == 'dim' and item.spot.typical_crowd == 'few'
            assert item.spot.verified_by is None and item.spot.verified_date is None
            assert item.crowd.category is None and item.crowd.observed_at is None
            assert item.rest_min == 105 - item.walk_to_min - item.walk_to_class_min
    # The same sample attributes cannot qualify as real scouted recommendations.
    local = RespiteEngine(engine.data, engine.library(demo=True))
    assert not local.recommend(ResetRequest(now=DEMO_TIME, needs=['few_people'])).recommendations


def test_needs_and_access_filter(engine):
    spot = scouted(engine, access='usc_id', indoor=True, lighting='dim', typical_crowd='few')
    local = RespiteEngine(engine.data, [spot])
    assert not local.recommend(ResetRequest(now=DEMO_TIME)).recommendations
    result = local.recommend(ResetRequest(now=DEMO_TIME,usc_id=True,needs=['quiet','seated','indoor','dim','few_people']))
    assert len(result.recommendations) == 1
    assert result.recommendations[0].crowd.source == 'Verified by scouts'
    assert result.recommendations[0].crowd.observed_at
    assert not local.recommend(ResetRequest(now=DEMO_TIME,usc_id=True,needs=['outdoor'])).recommendations


def test_hours_closing_and_overnight(engine):
    spot = scouted(engine, hours={'mon':[{'start':'12:00','end':'13:10'}]})
    local = RespiteEngine(engine.data, [spot])
    result = local.recommend(ResetRequest(now=DEMO_TIME,minutes=20))
    assert result.recommendations
    assert result.recommendations[0].leave_by.hour == 13
    assert result.recommendations[0].leave_by.minute == 10
    assert not local.recommend(ResetRequest(now=DEMO_TIME.replace(hour=14))).recommendations
    overnight = scouted(engine,hours={'mon':[{'start':'22:00','end':'02:00'}]})
    at = DEMO_TIME.replace(hour=1) + timedelta(days=1)
    assert open_until(overnight,at).hour == 2


def test_after_dark_and_departure_cutoff(engine):
    at = DEMO_TIME.replace(hour=21)
    assert not engine.recommend(ResetRequest(demo=True,demo_time=at)).recommendations
    overnight = scouted(engine,hours={'mon':[{'start':'00:00','end':'23:59'}]},safe_after_dark=None)
    local = RespiteEngine(engine.data,[overnight])
    assert not local.recommend(ResetRequest(now=at)).recommendations
    before = local.recommend(ResetRequest(now=at.replace(hour=18,minute=58),minutes=20))
    assert not before.recommendations
    local = RespiteEngine(engine.data,[overnight.model_copy(update={'safe_after_dark':True})])
    assert local.recommend(ResetRequest(now=at)).recommendations


def test_swap_is_request_scoped_and_expires(engine):
    request = ResetRequest(demo=True)
    original = engine.recommend(request)
    first = original.recommendations[0].spot.id
    swapped = engine.swap(SwapRequest(request=request, spot_id=first,reason='full'))
    assert swapped.recommendations[0].spot.id != first
    assert engine.recommend(request) == original
    assert swapped.exclusions[0].until == DEMO_TIME + timedelta(minutes=45)
    later = request.model_copy(update={'demo_time':DEMO_TIME+timedelta(minutes=46),'exclusions':swapped.exclusions})
    assert first in [r.spot.id for r in engine.recommend(later).recommendations]


def test_plan_day_has_no_storage(engine):
    request = PlanDayRequest(classes=[{'location':'Leavey','start':DEMO_TIME-timedelta(hours=1),'end':DEMO_TIME},
        {'location':'TCC','start':DEMO_TIME+timedelta(minutes=20),'end':DEMO_TIME+timedelta(hours=1)}],demo=True)
    plan = engine.plan_day(request)
    assert len(plan['gaps']) == 1 and plan['gaps'][0]['recommendation']
    with pytest.raises(ValidationError):
        PlanDayRequest(classes=[request.classes[0], request.classes[0]])


def test_bad_scout_import_preserves_routes_and_demo(engine, monkeypatch):
    def invalid():
        raise ValueError('invalid record')
    monkeypatch.setattr('app.services.respite.load_library', invalid)
    local = RespiteEngine(engine.data)
    assert local.library_error
    assert not local.recommend(ResetRequest(now=DEMO_TIME)).recommendations
    assert local.recommend(ResetRequest(demo=True)).recommendations


def test_jkp_lookup_does_not_invent_connected_entrance(engine):
    result = engine.recommend(ResetRequest(demo=True,next_class='JKP',minutes=20))
    assert result.next_class.name == 'Popovich Hall (JKP)'
    assert not result.recommendations
    assert any('connected' in n for n in result.notes)


def test_swap_and_delayed_navigation_keep_original_deadline(engine):
    local = RespiteEngine(engine.data,[scouted(engine)])
    original = local.recommend(ResetRequest(now=DEMO_TIME,minutes=20))
    assert original.recommendations
    later = ResetRequest(now=DEMO_TIME+timedelta(minutes=10),minutes=20,deadline=original.deadline)
    delayed = local.recommend(later)
    assert delayed.minutes == 10
    assert delayed.deadline == original.deadline
    assert delayed.recommendations[0].rest_min == original.recommendations[0].rest_min - 10
    swapped = local.swap(SwapRequest(request=later,spot_id=original.recommendations[0].spot.id))
    assert swapped.deadline == original.deadline
    expired = local.recommend(later.model_copy(update={'now':DEMO_TIME+timedelta(minutes=21)}))
    assert expired.minutes == 0 and not expired.recommendations
    with pytest.raises(ValueError,match='original recommendation deadline'):
        local.swap(SwapRequest(request=ResetRequest(now=DEMO_TIME),spot_id=original.recommendations[0].spot.id))


def test_navigation_fragment_preserves_eligibility_and_demo_context(engine):
    from urllib.parse import urlparse,unquote
    request = ResetRequest(demo=True,demo_time=DEMO_TIME.replace(hour=18,minute=50),minutes=30)
    result = engine.recommend(request)
    item = result.recommendations[0]
    context = json.loads(unquote(urlparse(item.deep_link).fragment.removeprefix('reset=')))
    assert context['deadline'] == result.deadline.isoformat()
    assert context['demo_time'] == result.evaluated_at.isoformat()
    assert context['preferences'] == request.preferences.model_dump()
    assert context['usc_id'] is False
    assert '#reset=' in item.deep_link and 'deadline' not in urlparse(item.deep_link).query


def test_exact_coincident_points_need_no_invented_walking_geometry(engine):
    spot = scouted(engine)
    local = RespiteEngine(engine.data,[spot])
    point = Point(lat=spot.lat,lon=spot.lng,name=spot.name)
    at_spot = local.recommend(ResetRequest(near=point,next_class=point,now=DEMO_TIME))
    item = at_spot.recommendations[0]
    assert item.walk_to_min == 0 and item.walk_to_class_min == 0
    assert item.rest_min == 15
    assert item.route_to_spot is None and item.route_to_class is None
    distinct = point.model_copy(update={'lat':point.lat+0.000000001})
    assert not local.recommend(ResetRequest(near=distinct,now=DEMO_TIME)).recommendations


def test_missing_graph_and_api_validation(engine, tmp_path):
    with pytest.raises(ValueError,match='snapshot'):
        RespiteEngine(MapData(tmp_path)).recommend(ResetRequest())
    with TestClient(app) as client:
        assert client.get('/api/health').json()['graph_loaded']
        assert client.get('/api/spots').json() == []
        assert len(client.get('/api/spots?demo=true').json()) == 6
        assert client.get('/api/spots/no-such-spot').status_code == 404
        assert client.get('/api/buildings').status_code == 200
        assert client.post('/api/reset-spots',json={'demo':True}).json()['recommendations']
        assert client.post('/api/reset-spots',json={'minutes':-1}).status_code == 422
        assert client.post('/api/reset-spots',json={'near':'Imaginary Hall'}).status_code == 422


def test_demo_bundle_matches_shared_engine(engine):
    path = Path(__file__).resolve().parents[2] / 'frontend/src/data/respite-demo.json'
    bundle = json.loads(path.read_text(encoding='utf-8'))
    for scenario in bundle['scenarios']:
        expected = engine.recommend(ResetRequest.model_validate(scenario['request'])).model_dump(mode='json')
        assert scenario['response'] == expected, 'Run scripts/export_respite_demo.py'


def test_saved_campus_legs_match_real_directed_router(engine):
    from app.models import Point, Preferences
    from app.services.spot_library import building_library, demo_library
    path = Path(__file__).resolve().parents[2] / 'frontend/src/data/demo-route-legs.json'
    catalog = json.loads(path.read_text(encoding='utf-8'))
    assert catalog['locations'] == building_library(engine.data)
    expanded = demo_library(engine.data, indoor=True, expanded=True)
    assert catalog['spots'] == [spot.model_dump(mode='json') for spot in expanded]
    assert len(expanded) > 6
    for location in catalog['locations']:
        point = Point(lat=location['lat'], lon=location['lon'], name=location['name'])
        for spot in expanded:
            target = Point(lat=spot.lat, lon=spot.lng, name=spot.name)
            pair = catalog['legs'][location['id']][spot.id]
            for key, start, end in [('outward', point, target), ('onward', target, point)]:
                try:
                    route = engine.walking_leg(start, end, Preferences())
                except ValueError:
                    assert key not in pair, 'An unreachable leg must not become a zero-minute walk.'
                else:
                    assert pair[key] == (route.model_dump(mode='json') if route else None)
