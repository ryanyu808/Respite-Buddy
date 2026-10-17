"""Download and validate a bounded, real OSM walking snapshot. No fictional fallback."""
from pathlib import Path
import json
import os
import sys
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from dotenv import load_dotenv
import geopandas as gpd
import networkx as nx
import numpy as np
import pandas as pd
import osmnx as ox
from shapely.geometry import mapping
from app.services.geographic_data import DATA_DIR
from app.services.sensory_scoring import ROAD_LEVELS, values, walkable

# West, south, east, north. This is a download boundary, not a destination coordinate.
BBOX = (-118.298, 34.010, -118.277, 34.032)
DESTINATIONS = {
    "USC Village": ["USC Village", "University Village"],
    "Leavey Library": ["Leavey Library"],
    "Doheny Memorial Library": ["Doheny Memorial Library", "Doheny Library"],
    "Tutor Campus Center": ["Ronald Tutor Campus Center", "Tutor Campus Center"],
    "Tommy Trojan": ["Tommy Trojan"],
    "Alumni Park": ["Alumni Park"],
    "McCarthy Quad": ["McCarthy Quad", "McCarthy Quadrangle"],
    "Exposition Park Rose Garden": ["Exposition Park Rose Garden", "Rose Garden"],
    "USC Fisher Museum": ["USC Fisher Museum of Art", "Fisher Museum of Art"],
    "Los Angeles Memorial Coliseum": ["Los Angeles Memorial Coliseum"],
}


def write_json(path, content):
    path.write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")


def prepare():
    load_dotenv(ROOT / ".env")
    ox.settings.cache_folder = ROOT / "tmp" / "overpass-cache"
    ox.settings.use_cache = True
    ox.settings.requests_timeout = 90
    ox.settings.overpass_rate_limit = False
    ox.settings.overpass_url = os.getenv("OVERPASS_URL", "https://overpass-api.de/api")
    ox.settings.useful_tags_way = list(set(ox.settings.useful_tags_way + ["foot", "access", "surface", "crossing", "footway"]))
    print("Downloading USC walking network...", flush=True)
    graph = ox.graph_from_bbox(BBOX, network_type="walk", simplify=False, retain_all=True)
    rejected = [(u, v, k) for u, v, k, d in graph.edges(keys=True, data=True) if not walkable(d)]
    graph.remove_edges_from(rejected)
    graph.remove_nodes_from(list(nx.isolates(graph)))
    graph = ox.simplify_graph(graph)
    print(f"Walking network: {len(graph)} nodes, {graph.number_of_edges()} edges. Downloading features...", flush=True)
    tags = {"leisure": ["park", "garden"], "landuse": ["grass", "recreation_ground"], "amenity": ["bench", "library"], "highway": ["primary", "secondary", "tertiary", "trunk", "primary_link", "secondary_link", "tertiary_link", "trunk_link"], "name": True}
    features = ox.features_from_bbox(BBOX, tags)
    features = features[features.geometry.notna() & features.geometry.is_valid]
    public = features[~features.get("access", pd.Series(index=features.index, dtype=str)).isin(["private", "no"])]
    green = public[(public.get("leisure", pd.Series(index=public.index, dtype=str)).isin(["park", "garden"])) | (public.get("landuse", pd.Series(index=public.index, dtype=str)).isin(["grass", "recreation_ground"]))]
    nodes, edges = ox.graph_to_gdfs(graph)
    projected = edges.to_crs(32611)
    # Road context is separate from the walking graph: foot=no roads still affect nearby paths.
    major_classes = {"primary", "secondary", "tertiary", "trunk", "primary_link", "secondary_link", "tertiary_link", "trunk_link"}
    major = features[features.get("highway", pd.Series(index=features.index, dtype=str)).isin(major_classes)].to_crs(32611)
    major_union = major.geometry.union_all() if len(major) else None
    green_union = green.to_crs(32611).geometry.union_all() if len(green) else None
    for (u, v, k), row in projected.iterrows():
        midpoint = row.geometry.interpolate(.5, normalized=True)
        road = max(ROAD_LEVELS.get(h, .35) for h in values(graph[u][v][k].get("highway", "unclassified")))
        proximity = max(0, 1 - midpoint.distance(major_union) / 100) if major_union is not None else 0
        traffic = max(road, .8 * proximity)
        edge = graph[u][v][k]
        edge.update(traffic=round(traffic, 4), noise=round(max(road, proximity), 4),
                    major=road >= .6)
        if green_union is not None:
            edge["green"] = round(max(0, 1 - midpoint.distance(green_union) / 80), 4)
    locations = []
    for label, aliases in DESTINATIONS.items():
        matches = public[public["name"].fillna("").astype(str).apply(lambda n: any(a.casefold() == n.casefold() for a in aliases))]
        if matches.empty:
            print(f"Omitting unverified preset: {label}")
            continue
        index, row = next(iter(matches.iterrows()))
        point = row.geometry.representative_point()
        node = min(graph.nodes, key=lambda n: (graph.nodes[n]["y"] - point.y) ** 2 + ((graph.nodes[n]["x"] - point.x) * .83) ** 2)
        from app.services.geographic_data import meters
        if meters(point.y, point.x, graph.nodes[node]["y"], graph.nodes[node]["x"]) > 120:
            print(f"Omitting preset too far from walking network: {label}")
            continue
        locations.append({"id": str(index[0]) + "-" + str(index[1]), "name": label,
                          "lat": point.y, "lon": point.x, "osm_url": f"https://www.openstreetmap.org/{index[0]}/{index[1]}"})
    stops = []
    for index, row in public.iterrows():
        amenity, leisure = row.get("amenity"), row.get("leisure")
        if amenity != "bench" and leisure != "park":
            continue
        p = row.geometry.representative_point()
        stops.append({"id": f"{index[0]}-{index[1]}", "name": str(row.get("name")) if isinstance(row.get("name"), str) else ("Mapped bench" if amenity == "bench" else "Nearby park"),
                      "kind": "bench" if amenity == "bench" else "park", "lat": p.y, "lon": p.x,
                      "opening_hours": row.get("opening_hours") if isinstance(row.get("opening_hours"), str) else None,
                      "osm_url": f"https://www.openstreetmap.org/{index[0]}/{index[1]}"})
    bounds = [min(n["x"] for _, n in graph.nodes(data=True)), min(n["y"] for _, n in graph.nodes(data=True)), max(n["x"] for _, n in graph.nodes(data=True)), max(n["y"] for _, n in graph.nodes(data=True))]
    assert all(np.isfinite(d["length"]) and d["length"] > 0 for _, _, d in graph.edges(data=True))
    assert all(walkable(d) for _, _, d in graph.edges(data=True))
    assert projected.geometry.is_valid.all()
    metadata = {"source": "OpenStreetMap contributors / Overpass API", "license": "ODbL 1.0", "retrieved_at": datetime.now(timezone.utc).isoformat(), "bounds": bounds, "requested_bounds": BBOX,
                "nodes": len(graph), "edges": graph.number_of_edges(), "components": nx.number_weakly_connected_components(graph),
                "excluded_edges": len(rejected), "locations": len(locations), "rest_stops": len(stops),
                "features": {"noise": True, "traffic": True, "green": len(green) > 0, "crowds": False, "live_conditions": False},
                "green_features": len(green), "major_road_segments": len(major),
                "notes": ["Noise and traffic are correlated geographic proxies, not live measurements. Major-road context includes vehicle roadways excluded from pedestrian routing.", "Crowd, lighting, construction and indoor conditions unavailable.", "Mapped access can be incomplete; follow signs. Building representative points are snapped to outdoor walking nodes.", "Small disconnected components are retained; unreachable selections return an error."]}
    DATA_DIR.parent.mkdir(parents=True, exist_ok=True)
    # Only publish a fully validated snapshot; keep the existing cache on download/validation errors.
    with tempfile.TemporaryDirectory(dir=ROOT / "tmp") as stage:
        stage = Path(stage)
        ox.save_graphml(graph, stage / "usc.graphml.gz")
        write_json(stage / "locations.json", locations)
        write_json(stage / "rest-stops.json", stops)
        write_json(stage / "features.geojson", {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"name": row.get("name") if isinstance(row.get("name"), str) else "Mapped green space"}, "geometry": mapping(row.geometry)} for _, row in green.iterrows()]})
        write_json(stage / "metadata.json", metadata)
        DATA_DIR.mkdir(exist_ok=True)
        for path in stage.iterdir():
            path.replace(DATA_DIR / path.name)
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    try:
        prepare()
    except Exception as exc:
        print(f"Preparation failed: {exc}. Existing snapshot has been preserved.", file=sys.stderr)
        sys.exit(1)
