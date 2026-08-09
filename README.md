# Records

A static site presenting a Discogs vinyl collection, built with Astro and deployed to GitHub Pages.

## How it works

Three stages, deliberately separate:

1. **Sync** (`npm run sync`) — the only thing that talks to Discogs. Fetches the
   collection, each release, and each master (for original release years), downloads
   cover art, and writes normalised JSON to `data/` plus images to `src/assets/`.
   Both are committed.
2. **Build** (`npm run build`) — Astro turns the committed data into static HTML and
   generates responsive WebP images. Never touches the network.
3. **Deploy** — GitHub Actions publishes `dist/` to Pages on every push to `main`,
   and re-syncs weekly.

Because the build reads committed data, it is reproducible and works when Discogs is
down or rate-limiting.

## Decade overrides

The decade facet files a record under `originalYear ?? pressedYear`, which is right
for reissues and wrong for compilations: Discogs stamps a compilation's own issue
date on both the pressing and the master, so Django Reinhardt's 1930s Quintette
sides land in the 1980s. The recording period exists only as prose on the sleeve, so
`data/decade-overrides.json` corrects it by hand — keyed by Discogs release id (ids
survive a re-sync, slugs don't), each entry a decade (never a year: a set of sides
cut across 1934–1939 has no single year) plus a note saying where the period is
stated. Sync applies it after normalisation, changing nothing but the facet, and
adds a "Recorded" row to the detail page so the filing explains itself. A malformed
entry fails the sync; an entry for a release no longer in the collection only warns.

## Setup

```bash
npm install
cp .env.example .env      # add a token from discogs.com/settings/developers
npm run sync              # ~2 minutes cold, cached thereafter
npm run dev
```

`DISCOGS_TOKEN` is used only at sync time and never reaches the browser. In CI it
lives as the `DISCOGS_TOKEN` repository secret.

## Commands

| Command | Does |
|---|---|
| `npm run sync` | Fetch from Discogs into `data/` and `src/assets/` (token from `.env`) |
| `npm run sync -- --force` | Ignore the local response cache |
| `npm run dev` | Local dev server |
| `npm run build` | Static build into `dist/` |
| `npm test` | Unit tests |
| `npm run verify` | Build, then smoke-test the output |
