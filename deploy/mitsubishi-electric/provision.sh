#!/usr/bin/env bash
# Provision the Mitsubishi Electric portal on a running CorpusKit instance.
#   BASE=https://mitsubishi-electric-ac-library.fly.dev ADMIN_PASSCODE=... ./provision.sh [step...]
# Steps: tenant brand alias kb upload analyse  (default: tenant brand alias)
# `kb` creates a knowledge box with the instance's ARAG_NUA_KEY and binds it.
# `upload` sends every PDF under CORPUS_DIR (default ./corpus/pdf).
set -euo pipefail
: "${BASE:?set BASE}"; : "${ADMIN_PASSCODE:?set ADMIN_PASSCODE}"
SLUG=mitsubishi-electric
HERE="$(cd "$(dirname "$0")" && pwd)"
CORPUS_DIR="${CORPUS_DIR:-$HERE/corpus/pdf}"
api() { curl -fsS -H "x-admin-passcode: $ADMIN_PASSCODE" "$@"; echo; }
json() { api -H 'content-type: application/json' "$@"; }

step_tenant() {
  json -X POST "$BASE/api/admin/tenants" -d '{"name":"Mitsubishi Electric","organisation":"Mitsubishi Electric Australia"}' || true
}
step_brand() {
  # Appearance and behaviour in one PATCH: the combined path writes the portal's
  # override record, so the palette choice is not shadowed by an earlier one.
  json -X PATCH "$BASE/api/admin/tenants/$SLUG" -d '{
    "name":"Air Conditioning Technical Library",
    "organisation":"Mitsubishi Electric Australia",
    "tagline":"Installation, service and operation manuals for Mitsubishi Electric air conditioning",
    "paletteId":"default",
    "colours":{"primary":"#231F20","accent":"#E60012","heroFrom":"#231F20","heroTo":"#3A3637"},
    "typography":"custom","shape":"square","density":"default",
    "searchPlaceholder":"Ask about a model, an error code or an installation step"}'
  api -X POST "$BASE/api/admin/t/$SLUG/branding/logo" -H 'content-type: image/png' --data-binary @"$HERE/brand/logo-plate.png"
  api -X POST "$BASE/api/admin/t/$SLUG/branding/hero" -H 'content-type: image/jpeg' --data-binary @"$HERE/brand/air-conditioners-for-the-home.jpg"
  for k in font-heading font-body; do
    api -X POST "$BASE/api/admin/t/$SLUG/branding/$k" -H 'content-type: font/woff2' --data-binary @"$HERE/brand/roboto-var.woff2"
  done
}
step_alias() {
  host="${ALIAS_HOST:-${BASE#https://}}"
  api -X PUT "$BASE/api/admin/t/$SLUG/aliases/$host"
}
step_kb() {
  json -X POST "$BASE/api/admin/t/$SLUG/knowledge-box/create" -d '{"title":"Mitsubishi Electric AC technical library"}'
}
step_upload() {
  shopt -s nullglob
  for f in "$CORPUS_DIR"/*.pdf; do
    echo "upload $(basename "$f")"
    api -X POST "$BASE/api/admin/t/$SLUG/resources/upload" -H 'content-type: application/pdf' \
      -H "x-filename: $(basename "$f")" --data-binary @"$f"
  done
}
step_analyse() {
  # Reads the corpus and proposes topics, questions and entity types (server-sent events).
  api -N -X POST "$BASE/api/admin/t/$SLUG/analyse"
}

steps=("$@"); [ ${#steps[@]} -eq 0 ] && steps=(tenant brand alias)
for s in "${steps[@]}"; do echo "== $s"; "step_$s"; done
