# Mitsubishi Electric - Air Conditioning Technical Library

A CorpusKit portal over official Mitsubishi Electric air conditioning technical documentation
(installation, operation and service manuals, data books, error code guides), branded for Mitsubishi
Electric Australia and hosted on Fly.io.

- Live: https://mitsubishi-electric-ac-library.fly.dev
- Fly app: `mitsubishi-electric-ac-library` (region `syd`, volume `corpuskit_data` at `/app/data`)
- Portal slug: `mitsubishi-electric`

## Deploy

```sh
fly secrets set ADMIN_PASSCODE=... ADMIN_BREAK_GLASS=true \
  BINDING_KEY="$(openssl rand -base64 32)" SESSION_SECRET="$(openssl rand -hex 32)" \
  ARAG_ZONE=aws-ap-southeast-2-1 ARAG_ACCOUNT=... ARAG_NUA_KEY=...
fly deploy
```

## Provision

```sh
export BASE=https://mitsubishi-electric-ac-library.fly.dev ADMIN_PASSCODE=...
./provision.sh                 # tenant, branding, host alias
./provision.sh fetch           # download the 100 manuals listed in corpus/manifest.json
./provision.sh kb upload videos  # create and bind a knowledge box, upload manuals and videos
./provision.sh analyse         # once processing has finished
```

`corpus/manifest.json` lists every document with its official source URL. The PDFs themselves are
not committed; fetch them from the manifest into `corpus/pdf/` before `upload`.

## Portal copy

The Explore hero headline is a portal setting (`headline` on `PATCH /api/admin/tenants/:slug`), with
the tagline shown beneath it. Research-oriented wording in the portal, How this works and Help has
been generalised to technical documentation.

## Brand assets

- `brand/mitsubishi-electric-australia-website-logo-1.svg` - official logo from
  mitsubishielectric.com.au
- `brand/logo-plate.png` - the mark and wordmark on a white plate, so it reads in dark mode too
  (rendered by `raster-plate.mjs`)
- `brand/air-conditioners-for-the-home.jpg` - hero image from mitsubishielectric.com.au
- `brand/roboto-var.woff2` - Roboto, the typeface used on the official site
