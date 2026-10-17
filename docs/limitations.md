# Prototype limitations

- This hackathon prototype is not production navigation or a medical device. It does not guarantee quietness, safety, accessibility or prevention of sensory overload.
- Sensory scores are static geographic proxy estimates. Noise and traffic overlap; crowd, lighting, construction and live conditions are unavailable. Crowd preferences are saved but inactive.
- A small USC snapshot is included; its streets, access tags, park shapes and amenities can be incomplete or outdated. Follow signs, gates and local guidance. Data refresh requires internet access and a backend restart.
- Destination points are mapped representative points, not verified entrances. Snaps up to 120 m are disclosed, excluded from time/distance and not certified as traversable entrance connectors. Disconnected selections are rejected.
- The walking graph is undirected, as is standard for OSMnx walking networks. It does not model directional pedestrian rules. Shortest parallel-edge reduction and bounded candidate generation can miss better alternatives. The search does not prove global optimality under a detour constraint.
- Walking time uses a configured constant speed with no crossing or congestion delay. A low score does not prove a comfortable experience for any particular individual.
- Potential rest stops are mapped benches or parks with no explicit private/no tag. Availability, opening hours, access and quietness remain unverified. Via-stop routing is not included.
- Local routing uses the included cache without external calls; basemap tiles need internet access. A tile-load warning preserves usable route comparisons if tiles fail.
- Optional OpenAI integration is implemented with timeouts, structured validation and fallback. The live paid API path cannot be verified without a configured key. Automated tests cover provider failure and invalid output. The deterministic path needs no key.
- Natural-language fallback recognizes a small set of preference words and negations. It can misunderstand complex phrasing. Settings are shown for confirmation; sliders remain authoritative.
- No continuous GPS guidance, turn-by-turn instructions, accounts, feedback persistence, citywide coverage or deployment is included. The path-name list is an accessible summary, not turn-by-turn navigation.
- Preferences persist only in this browser. There is no health data collection. When configured, assistant prompts/settings or route summaries are sent to OpenAI; tiles are fetched from OpenStreetMap.

Next priorities: field-validate campus access and entrance points; evaluate proxy assumptions with users; obtain consented measured environmental data; expand candidate routing and geographic coverage.
