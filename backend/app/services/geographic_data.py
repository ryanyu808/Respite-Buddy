from pathlib import Path
import json
import math
from xml.etree.ElementTree import ParseError

import networkx as nx
import osmnx as ox
from shapely.errors import GEOSException
from shapely.geometry import LineString

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "snapshot"


def meters(lat1, lon1, lat2, lon2):
    r = 6371000
    a, b = math.radians(lat1), math.radians(lat2)
    dlat, dlon = b - a, math.radians(lon2 - lon1)
    return 2 * r * math.asin(min(1, math.sqrt(math.sin(dlat / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(dlon / 2) ** 2)))


class MapData:
    def __init__(self, directory=DATA_DIR):
        self.graph = None
        self.metadata = {"source": "OpenStreetMap", "available": False,
                         "setup_error": "Map cache missing or invalid. Run backend/scripts/prepare_map.py, then restart the backend."}
        self.locations = []
        self.stops = []
        self.features = {"type": "FeatureCollection", "features": []}
        try:
            metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
            graph = ox.load_graphml(directory / "usc.graphml.gz",
                                    edge_dtypes={"noise": float, "traffic": float, "green": float, "major": lambda value: str(value).lower() == "true"})
            self.locations = json.loads((directory / "locations.json").read_text(encoding="utf-8"))
            self.stops = json.loads((directory / "rest-stops.json").read_text(encoding="utf-8"))
            self.features = json.loads((directory / "features.geojson").read_text(encoding="utf-8"))
            # Reduce parallel edges consistently; the actual retained geometry is used for routing.
            self.graph = nx.Graph()
            self.graph.graph.update(graph.graph)
            self.graph.add_nodes_from(graph.nodes(data=True))
            from .sensory_scoring import walkable
            for u, v, edge in graph.edges(data=True):
                if walkable(edge) and float(edge["length"]) > 0:
                    if not self.graph.has_edge(u, v) or edge["length"] < self.graph[u][v]["length"]:
                        edge.setdefault("geometry", LineString([(graph.nodes[u]["x"], graph.nodes[u]["y"]), (graph.nodes[v]["x"], graph.nodes[v]["y"])]))
                        self.graph.add_edge(u, v, **edge)
            self.metadata = {**metadata, "available": True}
        except (OSError, ValueError, KeyError, TypeError, ParseError, GEOSException, nx.NetworkXException) as exc:
            self.graph = None
            self.metadata["setup_error"] += f" ({type(exc).__name__})"

    def nearest(self, lat, lon):
        if self.graph is None:
            raise ValueError(self.metadata["setup_error"])
        node = min(self.graph.nodes, key=lambda n: (self.graph.nodes[n]["y"] - lat) ** 2 + ((self.graph.nodes[n]["x"] - lon) * .83) ** 2)
        point = self.graph.nodes[node]
        distance = meters(lat, lon, point["y"], point["x"])
        if distance > 120:
            raise ValueError("Choose a point within 120 meters of a mapped walking path inside the USC coverage area.")
        return node, distance
