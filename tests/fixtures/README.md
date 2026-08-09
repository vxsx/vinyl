# API fixtures

Trimmed real responses from the Discogs API, captured from the live collection.
Refresh with `npm run capture-fixtures` (reads `DISCOGS_TOKEN` from `.env`).

Each fixture exists to pin a specific edge case found in the real data:

| Fixture | Edge case |
|---|---|
| `substance` | Reissue — pressed 2015, master says 1988. 4 sides (A–D). 11 secondary images. |
| `hybrid-theory` | Genres are `["Hip Hop", "Rock"]`. Taking `genres[0]` files it under Hip Hop. |
| `rigoletto` | Long multi-artist credit, `year: 0`, phrase-valued `join` fields. |
| `blues-in-orbit` | 7" 45 RPM EP — the only non-LP shape besides one 12". |

Do not "tidy" these files. Their awkwardness is the point.
