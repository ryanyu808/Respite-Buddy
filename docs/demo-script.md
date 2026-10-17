# Two-minute live demo

Start both services before presenting, open http://127.0.0.1:5173 and confirm the map tiles load. No OpenAI key is needed. Do not download new map data immediately before presenting.

## 0:00–0:20 — The problem

“The shortest route isn't always the most comfortable walk. NeuroRoute lets people choose what matters to them—less road exposure, proximity to green spaces, or a shorter walk.”

## 0:20–0:50 — Real routing

Click **Try a campus demo**. The verified default is Exposition Park Rose Garden → USC Fisher Museum. The current snapshot gives a fastest path of 593.1 m and a calmer candidate of 640.4 m, an 8.0% distance detour and about 0.6 extra minutes at 4.8 km/h. These values are calculated, not presentation fixtures.

The demo uses noise 95, traffic 95, green 85, crowd 50 (inactive), “More calm,” maximum detour 30%. Compare the orange dashed fastest route and solid teal calmer route. Click each card; the map fits that route. The current modeled average exposure reduction is 26.8%, **not a measured reduction in noise or stress**.

## 0:50–1:15 — Personalization

Close the results, choose **Shortest walk**, and recalculate. The same network now prioritizes distance and combines the route roles when they coincide. Reset preferences or ask the assistant: “I'd prefer quiet green spaces and don't mind a few extra minutes.” Review the proposed settings, then click **Apply & recalculate**.

## 1:15–1:40 — Explain the choice

Click **Explain the tradeoff**. Explain that all distances, times and exposure values come from the routing engine. The optional AI translates preferences and selects emphasis; it never invents paths or metrics. Without a key, the rule-based mode provides the same core functionality.

## 1:40–2:00 — Honest and useful

Toggle **Potential rest stops** and open a mapped bench or park. Hours and quietness may be unknown. Open **Behind the map**: real OSM geography; estimated noise/traffic/green proximity; no live crowd data. “The goal is more choice, with transparent tradeoffs.”

## Backup verified scenarios

| Origin | Destination | Fastest / calmer | Extra time | Modeled exposure reduction |
| --- | --- | --- | --- | --- |
| USC Village | Exposition Park Rose Garden | 1,619.9 / 1,687.2 m | 0.8 min | 25.0% |
| USC Village | Tommy Trojan | 956.7 / 984.4 m | 0.3 min | 22.0% |

Use the same high sensitivity settings and 30% detour. Run `backend/scripts/verify_demo.py` after a data refresh; updated results are saved in `backend/data/snapshot/demo-scenarios.json`. Do not promise an alternative for Village → Leavey unless the current graph actually provides one.
