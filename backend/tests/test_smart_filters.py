import sys
from pathlib import Path
import pytest
from datetime import timedelta
from fastapi.testclient import TestClient
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.main import app
from app.respite_models import Spot,SpotFilters,ResetRequest,SwapRequest
from app.services.respite import RespiteEngine,DEMO_TIME
from app.services.geographic_data import MapData
from app.services.spot_library import demo_library
from app.services.campus_directory import candidates
from app.services.spot_filters import matches,known

@pytest.fixture(scope='module')
def data():return MapData()

def scout(data,**patch):
    raw=demo_library(data)[0].model_dump()
    raw.update(data_kind='scouted',verified_by='TEST FIXTURE ONLY',verified_date='2026-10-01')
    return Spot.model_validate({**raw,**patch})

@pytest.mark.parametrize('field,filter_name', [('outlets','outlets'),('step_free','step_free'),('restroom_nearby','restroom'),('food_allowed','food_allowed'),('food_available','food_available')])
def test_boolean_three_states_strict(data,field,filter_name):
    for value in [True,False,None]:
        spot=scout(data,**{field:value})
        assert matches(spot,SpotFilters(**{filter_name:True}),DEMO_TIME) is (value is True)

def test_candidate_positive_needs_attribute_evidence_and_is_not_scouted():
    pod=next(s for s in candidates() if s.id=='lvl-pod-210a')
    assert matches(pod,SpotFilters(outlets=True),DEMO_TIME)
    assert not matches(pod,SpotFilters(verified_only=True),DEMO_TIME)
    assert not matches(pod,SpotFilters(no_reservation=True),DEMO_TIME)
    assert not matches(pod.model_copy(update={'evidence':None}),SpotFilters(outlets=True),DEMO_TIME)
    assert not matches(pod,SpotFilters(open_now=True),DEMO_TIME)

def test_food_service_does_not_establish_food_permission_or_opening():
    for place in [s for s in candidates() if s.food_available is True]:
        assert matches(place,SpotFilters(food_available=True),DEMO_TIME)
        assert matches(place,SpotFilters(activity='eat'),DEMO_TIME)
        assert not matches(place,SpotFilters(food_allowed=True),DEMO_TIME)
        assert not matches(place,SpotFilters(open_now=True),DEMO_TIME)

def test_seating_noise_setting_opening_and_access(data):
    spot=scout(data,seating='soft',noise='low',indoor=True,access='usc_id',reservation_required=False)
    assert matches(spot,SpotFilters(comfortable_seating=True,quiet=True,indoor=True,open_now=True,access='usc_id',no_reservation=True),DEMO_TIME)
    for f in [SpotFilters(outdoor=True),SpotFilters(access='open'),SpotFilters(dim=True),SpotFilters(evening_access=True)]:assert not matches(spot,f,DEMO_TIME)
    assert not matches(spot,SpotFilters(open_now=True),DEMO_TIME.replace(hour=22))

def test_walking_limits_use_known_router_minutes(data):
    spot=scout(data)
    assert matches(spot,SpotFilters(max_walk_min=5),DEMO_TIME,5)
    assert not matches(spot,SpotFilters(max_walk_min=5),DEMO_TIME,6)
    assert not matches(spot,SpotFilters(max_walk_min=5),DEMO_TIME,None)

def test_strict_filter_applied_before_top_three_and_swap_keeps_deadline(data):
    base=scout(data)
    others=[base.model_copy(update={'id':f'no-outlet-{n}','outlets':False}) for n in range(4)]
    good=base.model_copy(update={'id':'outlet-match','outlets':True})
    backup=base.model_copy(update={'id':'outlet-backup','outlets':True})
    engine=RespiteEngine(data,[*others,good,backup])
    request=ResetRequest(now=DEMO_TIME,filters=SpotFilters(outlets=True))
    response=engine.recommend(request)
    assert {r.spot.id for r in response.recommendations}=={'outlet-match','outlet-backup'}
    swapped=engine.swap(SwapRequest(request=request.model_copy(update={'deadline':response.deadline,'now':DEMO_TIME+timedelta(minutes=2)}),spot_id=response.recommendations[0].spot.id))
    assert swapped.deadline==response.deadline and swapped.minutes==13
    assert len(swapped.recommendations)==1

def test_no_filter_promotes_candidates_and_unknowns_stay_null(data):
    engine=RespiteEngine(data,candidates())
    assert engine.recommend(ResetRequest(now=DEMO_TIME,filters=SpotFilters(outlets=True))).recommendations==[]
    assert len(candidates())==34
    assert RespiteEngine(data,[scout(data,reservation_required=True)]).recommend(ResetRequest(now=DEMO_TIME)).recommendations==[]

def test_directory_filtered_endpoint_and_invalid_filters():
    with TestClient(app) as client:
        result=client.post('/api/campus-candidates/filter',json={'filters':{'outlets':True}})
        assert result.status_code==200 and len(result.json()['places'])==6
        assert result.json()['mode']=='exploration'
        assert client.post('/api/campus-candidates/filter',json={'filters':{'food_available':True}}).json()['places']
        assert client.post('/api/campus-candidates/filter',json={'filters':{'open_now':True}}).json()['places']==[]
        assert client.post('/api/reset-spots',json={'filters':{'indoor':True,'outdoor':True}}).status_code==422
        distance=client.post('/api/campus-candidates/filter',json={'filters':{'max_walk_min':5}})
        assert distance.status_code==200
        assert distance.json()['places']
        assert all(p['walk_min'] is not None and p['walk_min']<=5 for p in distance.json()['places'])
        assert all(p['name']!='McCarthy Quad' for p in distance.json()['places'])
