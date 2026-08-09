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
