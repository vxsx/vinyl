# Vinyl collection site — design

**Date:** 2026-08-09
**Status:** Approved design, pending implementation plan

## Purpose

A static site that presents Vadim's Discogs vinyl collection (Discogs user `vxsx`)
beautifully enough to send to someone, while remaining pleasant for its owner to
browse. A wishlist view follows the same design once the Discogs wantlist has
entries.

Audience: the owner, plus anyone given the public URL. Hosted on GitHub Pages.

## Non-goals

- No editing. Discogs remains the system of record; the site is read-only.
- No accounts, comments, or marketplace/price data. (There *is* a client-side
  search box over the loaded records — but no search index, crawler, or backend.)
- No server. Everything is static files.
- No "recently added" as a primary organising principle — see Data findings.

## Data findings

Established by querying the live API against the real collection, not assumed.
These drive several decisions below.

| Fact | Value | Consequence |
|---|---|---|
| Collection size | 57 records | Whole collection ships in one page |
| Wantlist size | 0 items | Wishlist must render an empty state |
| Genre spread | Rock 21, Jazz 17, Classical 15, then Pop 6, Blues 5, Funk/Soul 5, Electronic 3, Hip Hop 2, Folk/World 2, Stage & Screen 1 | No single dominant genre; genre is a useful filter |
| Multi-genre records | 15 of 57 | Genre is a **tag, not a bucket** — filters, never exclusive shelves |
| Missing year | 14 of 57 (`year: 0`) | Needs an explicit Unknown state |
| Have a master release | 52 of 57 (13 of the 14 year-less ones) | Master lookup recovers ~2/3 of missing years |
| Longest artist credit | 188 chars (Verdi *Rigoletto*, full cast) | Layouts must never assume "Artist — Title" fits |
| Cover dimensions | ~600px, **not square** (599×600, 600×597) | Cannot assume 1:1; `object-fit: cover` crops a pixel or two |
| Full-size covers, all 57 | ~4.8 MB | Must generate optimised derivatives |
| Non-LP records | 2 (a 7" 45 RPM EP, a 12") | Format is worth showing only for these |
| Ratings used | 0 of 57 | Do not build rating UI |
| Dates added | All within four days, July 2026 | "Recently added" is meaningless today, useful later |

## Architecture

Three stages, each independently runnable:

```
  Discogs API  →  [ sync ]  →  data/ + covers/  →  [ build ]  →  dist/  →  GitHub Pages
                  Node/TS       committed JSON       Astro        static
                  script        and images                        HTML
```

**Why staged:** the site builds from committed local data, so a build never depends
on Discogs being reachable, never hits rate limits, and is reproducible. Sync is the
only thing that talks to Discogs, and it runs on a schedule rather than per build.

### Stage 1 — sync

A Node + TypeScript script, `scripts/sync.ts`, authenticated with a Discogs personal
access token from the `DISCOGS_TOKEN` environment variable.

Endpoints, in order:

1. `GET /users/{user}/collection/folders/0/releases?per_page=100` — paginated.
   Yields `basic_information` for every record: title, artists, cover URL, genres,
   styles, labels, formats, year, `master_id`, `date_added`.
2. `GET /releases/{id}` — once per record. Yields tracklist with side positions,
   credits (`extraartists`), identifiers (barcode, matrix runout), country,
   `released_formatted`, notes, and the full image set.
3. `GET /masters/{master_id}` — for the 52 records that have one. Yields the
   original release year, which the release endpoint does not carry.
4. `GET /users/{user}/wants?per_page=100` — same shape as the collection.

Roughly 110 calls for a cold sync. Discogs allows 60/min authenticated, so a cold
run takes about two minutes with throttling. Subsequent runs are incremental:
release and master responses are cached on disk keyed by id, and only ids new to
the collection are fetched. A `--force` flag refetches everything.

**Rate limiting:** the script reads the `X-Discogs-Ratelimit-Remaining` response
header and throttles to stay under the limit, with retry-after backoff on 429.

**Output:**

- `data/collection.json` — normalised records (see Data model)
- `data/wantlist.json` — same record shape
- `data/synced-at.json` — ISO timestamp, shown in the site footer
- `data/covers/{release_id}.jpg` — the ~600px primary cover, downloaded once
- `data/images/{release_id}/{n}.jpg` — secondary images (back, labels, inner sleeves)

Data and images are committed. At current size that is a few MB; even at 500
records it stays well inside GitHub Pages' 1 GB limit.

### Stage 2 — build

**Astro**, producing fully static output.

Chosen because it emits static HTML with zero JavaScript by default (the tilt is the
only script on the page), has a built-in image pipeline that generates responsive
AVIF/WebP derivatives at build time — which is exactly the 4.8 MB problem — and uses
TypeScript with schema-validated content collections. Eleventy was the main
alternative but needs the image pipeline assembled by hand; a plain Vite + TS build
would mean writing routing and image handling from scratch.

Pages:

| Route | Contents |
|---|---|
| `/` | The collection grid |
| `/record/{slug}/` | Detail page, one per record (57 static pages) |
| `/wishlist/` | Same grid, fed from `wantlist.json`; empty state until it has entries |

`slug` is derived from artist and title, deduplicated with the release id when two
records collide.

### Stage 3 — deploy

GitHub Actions:

- **Build and deploy** on push to `main` → GitHub Pages.
- **Scheduled sync** — a weekly cron plus manual `workflow_dispatch`. Runs the sync,
  and if `data/` changed, commits and pushes, which triggers the deploy. Adding a
  record on Discogs makes the site update itself.

`DISCOGS_TOKEN` lives only as an Actions secret. Because the token is used at sync
time and never at request time, it never reaches the browser. This is why static
hosting suits the project rather than constraining it.

## Data model

One normalised record shape, used by both collection and wishlist:

```ts
type Record = {
  id: number
  slug: string
  title: string
  artist: string           // joined display string, may be very long
  artistSort: string       // for alphabetical ordering
  coverPath: string        // local path under data/covers/
  genres: string[]         // a record may have several — always treat as tags
  styles: string[]
  label: string
  catno: string
  country: string | null
  pressedYear: number | null    // this pressing; null when Discogs has none
  originalYear: number | null   // from the master release
  isOriginalPressing: boolean   // pressedYear === originalYear
  formatDescriptions: string[]  // e.g. ["LP", "Compilation", "Reissue"]
  isPlainLP: boolean            // controls whether format is shown at all
  tracklist: { position: string; title: string; duration: string | null }[]
  sides: string[]               // derived: ["A", "B", "C", "D"]
  credits: { role: string; name: string }[]
  identifiers: { type: string; description: string | null; value: string }[]
  notes: string | null
  images: { path: string; width: number; height: number }[]  // secondary only
  dateAdded: string             // ISO
}
```

Decisions embedded here:

- **`genres` stays an array.** Taking `genres[0]` mislabels 15 of 57 records —
  *Hybrid Theory* is `["Hip Hop", "Rock"]`, *Gaucho* is `["Jazz", "Rock"]`.
- **Both years are separate nullable fields.** A missing `pressedYear` is a real
  state, not zero.
- **`sides` is derived at sync time** by taking the leading letter of each track
  position, so the build does no parsing.

## The collection grid

Settled through iteration against the real covers.

**Layout.** Covers only — no text at rest. Fixed column counts rather than
`auto-fill`, so the sleeve size is predictable: 5 columns at ≥1440px, 4 at ≥1080px,
3 at ≥700px, 2 below. Gaps 34px column, 56px row. At 1440px that is roughly 260px
per sleeve, and larger on wider screens.

**Sleeves carry no chrome.** No border, no border-radius, no overflow clipping, no
inset ring. The artwork meets the background directly. The image sits exactly 1:1
with its box and never translates, so no edge can be exposed.

*Implementation note:* the mockup hit this bug through a CSS class-name collision
(`.card` was also a harness class supplying a white rounded bordered box). Worth
namespacing grid classes in the real build.

**Hover** — a tvOS-style focus effect, four simultaneous parts:

| Part | Value |
|---|---|
| Tilt | max 12°, `rotateX`/`rotateY` toward the pointer |
| Perspective | **2400px, applied per card** — not on the grid container |
| Lift | `scale(1.05)`, shadow deepening to `0 30px 54px rgba(0,0,0,.75)` |
| Specular | diagonal band at 102°, peak `rgba(255,255,255,.34)`, `background-size: 260%`, position driven by tilt, `mix-blend-mode: screen` |
| Ambient | `linear-gradient` on `soft-light` at 70%, angle shifting with tilt |
| Timing | 0.08s ease-out engaging, 0.5s `cubic-bezier(.2,.9,.28,1)` returning |

Two things matter here and are easy to get wrong:

- **Perspective must be per card.** On the container, all cards share one vanishing
  point at the grid's centre, so cards near the edges shear instead of turning. This
  is what reads as "skew" rather than 3D. The distance itself (2400px) is
  deliberately subtle.
- **The specular is driven by tilt, not cursor position.** A highlight tracking the
  cursor reads as software. A band sweeping opposite the tilt reads as a fixed light
  on a turning surface. Both blend rather than paint white, so dark sleeves catch
  light without going milky.

**Captions** appear only on hover, below the sleeve, positioned absolutely so they
cost no layout shift, and outside the 3D transform so text stays crisp rather than
tilting into blur.

**Accessibility.** Each sleeve is a real `<a>` to its detail page, not a
click-handled `div` — so keyboard navigation, focus rings, middle-click, and "open in
new tab" all work without extra code. The tilt is decorative: under
`prefers-reduced-motion: reduce` the tilt, lift, and specular are disabled and hover
resolves to a plain caption reveal. Covers carry `alt` text of artist and title.

**Filters**, above the grid:

- Genre chips, multi-select, OR-combined, each showing its count
- Decade chips, including an explicit **Unknown** chip
- Free-text search across artist, title, and label
- A live count of matching records

All client-side over the full dataset — 57 records, and still fine at several
hundred. Filter state is deliberately **not** reflected in the URL: filtered views
are not worth sharing, and keeping it out avoids history-management code.

**Ordering:** alphabetical by `artistSort`. Not by date added, which is currently
uniform.

## The detail page

Reached by clicking a sleeve.

Left column: the primary cover at full width, and beneath it the secondary images as
**small wrapping thumbnails** (64px, `auto-fill` grid, no horizontal scroll). Clicking
a thumbnail swaps the main image.

Right column, in order:

1. **Eyebrow** — label, catalogue number, country
2. **Title and artist**
3. **Genre and style chips**
4. **Facts row** — Pressed (`released_formatted`); Originally released, with the gap
   in years, *or* "Original pressing" when the two match; Tracks over N sides
5. **Tracklist**, grouped by side — Side A, Side B, … with positions and durations.
   Sides are native to the format and come free from Discogs' position field.
6. **Credits** and **Pressing details** side by side — the latter being barcodes and
   matrix runout etchings, which is what distinguishes this copy from other pressings
7. **Notes** — Discogs' pressing notes

Deliberately excluded: listen/video links; a Format row for ordinary LPs. Format
appears **only when the record is not a plain 12" LP**, which today means the 7" EP
and the 12" single.

## Error handling

| Case | Behaviour |
|---|---|
| Missing `pressedYear` | Show "—"; record joins the Unknown decade filter |
| No master release | Omit the "Originally released" fact entirely |
| Missing cover | Neutral placeholder tile at the correct aspect ratio |
| Empty tracklist | Omit the tracklist block |
| Empty wantlist | Wishlist page renders an explanatory empty state |
| Discogs 429 during sync | Back off per `Retry-After`, resume; never partially overwrite `data/` |
| Discogs unreachable | Sync exits non-zero and leaves existing data untouched; the site still builds |
| Very long artist string | Clamped in the grid caption, shown in full on the detail page |

The sync writes to a temporary directory and moves it into place only on success, so
a failed sync can never leave `data/` half-written.

## Testing

Proportionate to a static personal site:

- **Sync normalisation** — unit tests over API fixtures committed to the repo. The
  fixtures must cover the edge cases found in the real data: a multi-genre record
  (*Hybrid Theory*), a year-less classical record, a reissue whose master supplies
  the original year (*Substance*, 2015/1988), a 4-side release, a non-LP format, and
  the 188-character artist credit. Real payloads for several of these were captured
  during design and should be trimmed and committed as the starting fixture set.
- **Schema validation** — the build fails if `collection.json` does not match the
  record schema.
- **Build smoke test** — build succeeds, produces one page per record plus index and
  wishlist, and no page references a missing image.

No browser or visual-regression testing; the hover effect is verified by eye.

## Open decisions

None blocking. Astro is a recommendation rather than a constraint — if it proves
awkward the staged architecture means only stage 2 changes.
