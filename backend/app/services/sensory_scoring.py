"""Geographic proxies, never measurements of sensory stress."""

ROAD_LEVELS = {
    "motorway": 1.0, "trunk": 1.0, "primary": .95, "secondary": .8,
    "tertiary": .6, "residential": .3, "unclassified": .35,
    "service": .2, "living_street": .15, "pedestrian": .05,
    "footway": .03, "path": .03, "steps": .03,
}


def values(value):
    return value if isinstance(value, list) else [value]


def walkable(edge):
    """Conservative exclusion, including explicit vehicle-only ways."""
    return not (
        any(str(v) in {"no", "private"} for v in values(edge.get("access", "yes")))
        or any(str(v) in {"no", "private", "use_sidepath"} for v in values(edge.get("foot", "yes")))
        or any(str(v) in {"motorway", "motorway_link", "trunk", "trunk_link", "construction", "proposed"}
               for v in values(edge.get("highway", "")))
    )


def exposure(edge, preferences):
    components = [(preferences.noise, edge.get("noise", 0)),
                  (preferences.traffic, edge.get("traffic", 0))]
    if edge.get("green") is not None:
        components.append((preferences.green, 1 - edge["green"]))
    total = sum(w for w, _ in components)
    return sum(w * value for w, value in components) / total if total else 0.0


def cost(edge, preferences, strength=1.0):
    # Sensitivity changes both component importance and penalty magnitude.
    magnitude = (preferences.noise + preferences.traffic + (preferences.green if edge.get("green") is not None else 0)) / 300
    return float(edge["length"]) * (1 + strength * magnitude * exposure(edge, preferences))
