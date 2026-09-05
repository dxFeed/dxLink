#!/usr/bin/env bash
#
# Publishes the package in the current directory. Run per package by `pnpm -r exec`.
#
# Packing is pnpm's and publishing is npm's, and neither can do the other's: `pnpm pack` rewrites
# `workspace:*` into concrete versions, which npm knows nothing about; `npm publish` does the OIDC
# exchange for Trusted Publishing, which pnpm 11.8 cannot.
#
# Env: DRY_RUN=1 packs and validates without publishing.
set -euo pipefail

name=$(node -p 'require("./package.json").name')
version=$(node -p 'require("./package.json").version')
private=$(node -p 'require("./package.json").private === true')

if [ "$private" = 'true' ]; then
  echo "skip $name — private"
  exit 0
fi

# Makes the step re-runnable after a release that failed halfway.
if npm view "$name@$version" version >/dev/null 2>&1; then
  echo "skip $name@$version — already on npm"
  exit 0
fi

tarball=$(pnpm pack --pack-destination "${RUNNER_TEMP:-${TMPDIR:-/tmp}}" | tail -1)

echo "publishing $name@$version from $tarball"
# No --provenance flag: Trusted Publishing attaches a provenance attestation on its own.
npm publish "$tarball" --access public ${DRY_RUN:+--dry-run}
