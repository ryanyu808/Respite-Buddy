"""Reproducible saved demos from the shared engine, using real snapshot routes."""
import json
import sys
from itertools import combinations
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.geographic_data import MapData
from app.services.respite import RespiteEngine
from app.respite_models import ResetRequest

OUT = Path(__file__).resolve().parents[2] / 'frontend' / 'src' / 'data' / 'respite-demo.json'


def build():
    engine = RespiteEngine(MapData())
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
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(build(), separators=(',',':')) + '\n', encoding='utf-8')
    print(f'Wrote {OUT} ({OUT.stat().st_size // 1024} KB)')
