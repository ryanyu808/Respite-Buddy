"""Reproducible saved demos from the shared engine, using real snapshot routes."""
import json
import sys
from itertools import combinations
from datetime import datetime
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.geographic_data import MapData
from app.services.respite import RespiteEngine
from app.respite_models import ResetRequest

OUT = Path(__file__).resolve().parents[2] / 'frontend' / 'src' / 'data' / 'respite-demo.json'


def build():
    engine = RespiteEngine(MapData())
    scenarios = []
    supported = ['quiet','seated','outdoor']
    need_sets = [list(group) for size in range(4) for group in combinations(supported,size)]
    need_sets += [['dim'],['few_people'],['indoor']]
    need_sets += [['quiet','indoor'], ['seated','indoor'], ['quiet','seated','indoor']]
    # Retain older deep links, but the UI only offers 15/30/45/60. The 240-minute
    # seed supports arbitrary selected-clock demo windows from the same real routes.
    for minutes in [5,10,12,15,20,30,45,60,240]:
        for needs in need_sets:
            for next_class in [None,'TCC']:
                for demo_time in [None, datetime.fromisoformat('2026-10-19T21:00:00-07:00')]:
                    request = ResetRequest(demo=True, minutes=minutes, needs=needs, next_class=next_class, demo_time=demo_time)
                    scenarios.append({'request': request.model_dump(mode='json'),
                                      'response': engine.recommend(request).model_dump(mode='json')})
    default = next(s for s in scenarios if s['request']['minutes'] == 15 and not s['request']['needs'] and s['request']['next_class'] is None and s['request']['demo_time'] is None)
    return {**default, 'scenarios': scenarios,
            'provenance': 'Real OSM coordinates and engine-computed routes. Demo spot attributes are simulated. No crowd observations.'}


if __name__ == '__main__':
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(build(), separators=(',',':')) + '\n', encoding='utf-8')
    print(f'Wrote {OUT} ({OUT.stat().st_size // 1024} KB)')
