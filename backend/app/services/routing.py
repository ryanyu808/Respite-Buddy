import math
import os
import networkx as nx
from .sensory_scoring import cost, exposure
from ..models import Point, RouteRequest, RouteResponse, RouteResult, LineGeometry, Breakdown


def path_edges(path):
    return {frozenset((u, v)) for u, v in zip(path, path[1:])}


def oriented_coordinates(graph, path):
    coordinates = []
    for u, v in zip(path, path[1:]):
        line = list(graph[u][v]["geometry"].coords)
        node = graph.nodes[u]
        if (line[-1][0] - node["x"]) ** 2 + (line[-1][1] - node["y"]) ** 2 < (line[0][0] - node["x"]) ** 2 + (line[0][1] - node["y"]) ** 2:
            line.reverse()
        coordinates.extend(line if not coordinates else line[1:])
    return coordinates


def explain(route, fastest):
    text = f"This {route.name.lower()} is {route.distance_m / 1000:.2f} km, about {route.duration_min:.1f} minutes at the assumed walking speed. "
    if route.id == fastest.id:
        text += "It is the shortest mapped walking path by distance. "
    else:
        text += f"Compared with the fastest route, it adds about {route.extra_minutes:.1f} minutes. "
        delta = route.reduction_pct
        text += (f"Its preference-weighted exposure estimate is {delta:.0f}% lower. " if delta > 0 else "It does not lower the average exposure estimate under these preferences. ")
    text += f"It includes {route.major_road_m:.0f} m on mapped major-road segments. "
    if route.breakdown.green is not None:
        text += f"The distance-weighted green-space proximity index is {route.breakdown.green}/100. "
    return text + "These are geographic proxies; actual conditions may differ. Crowd data is unavailable."


class Router:
    def __init__(self, data):
        self.data = data

    def calculate(self, request: RouteRequest):
        graph = self.data.graph
        if graph is None:
            raise ValueError(self.data.metadata["setup_error"])
        source, source_distance = self.data.nearest(request.origin.lat, request.origin.lon)
        target, target_distance = self.data.nearest(request.destination.lat, request.destination.lon)
        if source == target:
            raise ValueError("Start and destination snap to the same walking point. Choose locations farther apart.")
        preferences = request.preferences
        try:
            fastest = nx.shortest_path(graph, source, target, weight="length")
        except nx.NetworkXNoPath as exc:
            raise ValueError("These locations are on disconnected walking paths. Try another nearby point.") from exc
        length = lambda path: sum(graph[u][v]["length"] for u, v in zip(path, path[1:]))
        base_length = length(fastest)
        limit = math.inf if preferences.max_detour is None else base_length * (1 + preferences.max_detour / 100)
        candidates = [fastest]
        # Bounded weighted shortest paths, not unbounded simple-path enumeration.
        for strength in [.5, 1, 2, 4, 8, 16, 32]:
            path = nx.shortest_path(graph, source, target, weight=lambda u, v, d: cost(d, preferences, strength))
            if length(path) <= limit + 1e-7 and path not in candidates:
                candidates.append(path)
        # A few diversity candidates recover alternatives hidden by the weighted path frontier.
        for existing in list(candidates)[:4]:
            used = path_edges(existing)
            path = nx.shortest_path(graph, source, target, weight=lambda u, v, d: cost(d, preferences, 4) * (1.4 if frozenset((u, v)) in used else 1))
            if length(path) <= limit + 1e-7 and path not in candidates:
                candidates.append(path)
        burden = lambda path: sum(graph[u][v]["length"] * exposure(graph[u][v], preferences) for u, v in zip(path, path[1:]))
        calmer = min(candidates, key=lambda path: (burden(path), length(path)))
        balanced = min(candidates, key=lambda path: (sum(cost(graph[u][v], preferences, 2) for u, v in zip(path, path[1:])), length(path)))
        selected = [("fastest", "Fastest route", fastest), ("calmer", "Calmer route", calmer), ("balanced", "Balanced route", balanced)]
        unique = []
        notes = ["Scores are relative geographic estimates, not measured sound or sensory stress.", "Crowd sensitivity is saved but excluded from routing because crowd data is unavailable."]
        speed = float(os.getenv("WALKING_SPEED_KPH", "4.8"))
        if not math.isfinite(speed) or not 1 <= speed <= 10:
            speed = 4.8
        base_score = burden(fastest) / base_length * 100
        for role, name, path in selected:
            edgeset = path_edges(path)
            duplicate = next((entry for entry in unique if len(edgeset & entry[2]) / max(1, len(edgeset | entry[2])) >= .94), None)
            if duplicate:
                duplicate[0].roles.append(role)
                continue
            edges = [graph[u][v] for u, v in zip(path, path[1:])]
            distance = length(path)
            avg = lambda key: sum(d["length"] * d.get(key, 0) for d in edges) / distance
            score = burden(path) / distance * 100
            streets = []
            for edge in edges:
                street = edge.get("name", "Unnamed walking path")
                street = ", ".join(street) if isinstance(street, list) else street
                if not streets or streets[-1] != street:
                    streets.append(street)
            result = RouteResult(id=role, name=name, roles=[role], distance_m=round(distance, 1), duration_min=round(distance / (speed * 1000 / 60), 1),
                                 exposure=round(score), breakdown=Breakdown(noise=round(avg("noise") * 100), traffic=round(avg("traffic") * 100), green=round(avg("green") * 100) if all("green" in d for d in edges) else None),
                                 major_road_m=round(sum(d["length"] for d in edges if d.get("major")), 1),
                                 extra_minutes=round((distance - base_length) / (speed * 1000 / 60), 1),
                                 reduction_pct=round((base_score - score) / base_score * 100, 1) if base_score > 0 else 0,
                                 detour_pct=round((distance / base_length - 1) * 100, 1), confidence="Geographic proxies · limited sensory coverage",
                                 geometry=LineGeometry(coordinates=oriented_coordinates(graph, path)), streets=streets, explanation="")
            unique.append((result, path, edgeset))
        routes = [entry[0] for entry in unique]
        for route in routes:
            route.explanation = explain(route, routes[0])
        if len(routes) == 1:
            notes.append("No substantially different lower-exposure route was found within your detour limit. The fastest route is also the recommendation.")
        if preferences.noise + preferences.traffic + preferences.green == 0:
            notes.append("All available sensory weights are zero; the exposure score is zero by definition, not evidence of no exposure.")
        preferred_role = {"fastest": "fastest", "balanced": "balanced", "calmest": "calmer"}[preferences.pace]
        recommended = next(r.id for r in routes if preferred_role in r.roles)
        a, b = graph.nodes[source], graph.nodes[target]
        return RouteResponse(routes=routes, recommended_id=recommended, notes=notes,
                             snapped_origin=Point(lat=a["y"], lon=a["x"], name=request.origin.name),
                             snapped_destination=Point(lat=b["y"], lon=b["x"], name=request.destination.name),
                             origin_snap_m=round(source_distance, 1), destination_snap_m=round(target_distance, 1))
