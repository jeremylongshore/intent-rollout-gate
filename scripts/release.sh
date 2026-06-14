#!/usr/bin/env bash
#
# scripts/release.sh — local maintainer release convenience for intent-rollout-gate.
#
# This script is the LOCAL half of the release flow. It bumps package.json and
# creates + pushes the `vX.Y.Z` tag. The pushed tag triggers `.github/workflows/
# release.yml`, which does the REST: verifies the tag matches package.json,
# rebuilds + reproducibility-checks the committed dist/index.js, creates the
# GitHub Release, retags the floating major alias, and (on a separate, gated,
# dispatch-only path) signs dist with cosign keyless against PRODUCTION sigstore.
#
# This script DOES NOT publish, release, or sign anything itself — it only does
# the bump + tag + push. Everything downstream of the tag is release.yml's job.
# (This repo ships a GitHub *Action*, not an npm package: the committed
# dist/index.js IS the published artifact, resolved by `uses: ...@vX`. There is
# no `npm publish` step anywhere — neither here nor in release.yml.)
#
# Canonical pattern (matches release.yml's header contract): the maintainer runs
# `npm version <patch|minor|major>` to bump + tag locally, then pushes the tag.
# We wrap that with the safety pre-flight a release needs so the tag never
# triggers a release.yml run that is doomed to fail (stale dist, dirty tree,
# wrong branch, tag/version drift).
#
# Usage:
#   scripts/release.sh <patch|minor|major|X.Y.Z>   [--dry-run] [--remote <name>]
#
#   scripts/release.sh patch         # 0.2.0 -> 0.2.1, tag v0.2.1, push
#   scripts/release.sh minor         # 0.2.0 -> 0.3.0
#   scripts/release.sh major         # 0.2.0 -> 1.0.0
#   scripts/release.sh 0.4.0         # explicit version
#   scripts/release.sh patch --dry-run   # do everything except the bump + push
#
# After the tag lands, watch the run:
#   gh run watch --workflow=release.yml
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve repo root so the script works from anywhere.
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

RELEASE_BRANCH="main"

die() {
  echo "::error::$*" >&2
  echo "release aborted." >&2
  exit 1
}

info() { echo "==> $*"; }

usage() {
  sed -n '3,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# ---------------------------------------------------------------------------
# Parse args.
# ---------------------------------------------------------------------------
BUMP=""
DRY_RUN=false
REMOTE="origin"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h | --help) usage 0 ;;
    --dry-run) DRY_RUN=true ;;
    --remote)
      shift
      [ "$#" -gt 0 ] || die "--remote requires a value"
      REMOTE="$1"
      ;;
    patch | minor | major)
      [ -z "${BUMP}" ] || die "bump already set to '${BUMP}'; got extra '$1'"
      BUMP="$1"
      ;;
    [0-9]*.[0-9]*.[0-9]*)
      [ -z "${BUMP}" ] || die "bump already set to '${BUMP}'; got extra '$1'"
      BUMP="$1"
      ;;
    *) die "unknown argument '$1' (expected patch|minor|major|X.Y.Z, --dry-run, --remote)" ;;
  esac
  shift
done

[ -n "${BUMP}" ] || usage 1

# ---------------------------------------------------------------------------
# Tooling pre-flight.
# ---------------------------------------------------------------------------
command -v git >/dev/null 2>&1 || die "git not found on PATH"
command -v node >/dev/null 2>&1 || die "node not found on PATH"
command -v npm >/dev/null 2>&1 || die "npm not found on PATH"
command -v pnpm >/dev/null 2>&1 || die "pnpm not found on PATH (used for the dist build)"

# ---------------------------------------------------------------------------
# Repo-state pre-flight — refuse to release from a state that would either fail
# release.yml or produce an inconsistent tag.
# ---------------------------------------------------------------------------
current_branch="$(git rev-parse --abbrev-ref HEAD)"
[ "${current_branch}" = "${RELEASE_BRANCH}" ] ||
  die "must release from '${RELEASE_BRANCH}', currently on '${current_branch}'"

if [ -n "$(git status --porcelain)" ]; then
  die "working tree is dirty — commit or stash before releasing (a release tags HEAD)"
fi

info "fetching ${REMOTE} to check we are up to date..."
git fetch --quiet --tags "${REMOTE}" "${RELEASE_BRANCH}"

local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse "${REMOTE}/${RELEASE_BRANCH}")"
[ "${local_head}" = "${remote_head}" ] ||
  die "local ${RELEASE_BRANCH} (${local_head:0:8}) is not in sync with ${REMOTE}/${RELEASE_BRANCH} (${remote_head:0:8}) — pull/push first"

# ---------------------------------------------------------------------------
# Compute the target version + tag, and refuse if the tag already exists.
# `npm version --no-git-tag-version` would mutate package.json; we instead
# resolve the next version with a dry, no-write semver bump so we can validate
# BEFORE touching anything.
# ---------------------------------------------------------------------------
current_version="$(node -p "require('./package.json').version")"
info "current package.json version: ${current_version}"

case "${BUMP}" in
  patch | minor | major)
    # The single-quoted Node script is intentional: ${...} inside it is JS
    # template-literal syntax evaluated by node, NOT shell expansion. The two
    # inputs reach node via process.argv (the trailing args), so nothing here
    # should be shell-expanded.
    # shellcheck disable=SC2016
    next_version="$(node -e '
      const [type, cur] = [process.argv[1], process.argv[2]];
      const m = cur.match(/^(\d+)\.(\d+)\.(\d+)$/);
      if (!m) { console.error("non-semver current version: " + cur); process.exit(1); }
      let [maj, min, pat] = m.slice(1).map(Number);
      if (type === "major") { maj++; min = 0; pat = 0; }
      else if (type === "minor") { min++; pat = 0; }
      else { pat++; }
      process.stdout.write(`${maj}.${min}.${pat}`);
    ' "${BUMP}" "${current_version}")"
    ;;
  *)
    next_version="${BUMP}"
    ;;
esac

tag="v${next_version}"
info "target version: ${next_version}  (tag ${tag})"

if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
  die "tag ${tag} already exists locally — pick a different version"
fi
if git ls-remote --exit-code --tags "${REMOTE}" "refs/tags/${tag}" >/dev/null 2>&1; then
  die "tag ${tag} already exists on ${REMOTE} — pick a different version"
fi

# ---------------------------------------------------------------------------
# dist pre-flight — release.yml rebuilds dist/index.js and fails on any diff
# from the committed bundle. Reproduce that gate locally so we never push a tag
# the release is guaranteed to reject.
# ---------------------------------------------------------------------------
info "verifying dependencies (frozen lockfile)..."
pnpm install --frozen-lockfile >/dev/null

info "verifying the committed dist/index.js is reproducible from src/..."
pnpm run build >/dev/null
if ! git diff --quiet -- dist/; then
  git --no-pager diff --stat -- dist/ >&2
  die "committed dist/index.js is stale — run 'pnpm run build', commit the result, then re-run this script"
fi
info "dist/index.js is in sync."

info "running the full check gate (typecheck + tests)..."
pnpm run check >/dev/null
info "check gate green."

# ---------------------------------------------------------------------------
# Bump + tag + push.
#
# `npm version <bump>` writes package.json and creates the annotated tag vX.Y.Z
# in one atomic step (git-tag-version defaults to true). We pass --no-commit-hooks
# only to keep the bump deterministic; the tree was already verified clean above.
# Then push the bump commit AND the tag (--follow-tags). The tag push is what
# triggers release.yml.
# ---------------------------------------------------------------------------
if [ "${DRY_RUN}" = true ]; then
  info "DRY-RUN: would run 'npm version ${next_version}' then 'git push --follow-tags ${REMOTE} ${RELEASE_BRANCH}'."
  info "DRY-RUN: no files changed, no tag created, nothing pushed."
  exit 0
fi

info "bumping package.json to ${next_version} and creating tag ${tag}..."
# Pass the explicit version (not the bump keyword) so npm tags exactly ${tag},
# matching the version we validated above.
npm version "${next_version}" \
  --message "chore(release): %s" \
  --no-commit-hooks >/dev/null

# Belt-and-suspenders: confirm npm created the tag we expect.
git rev-parse -q --verify "refs/tags/${tag}" >/dev/null ||
  die "npm version did not create the expected tag ${tag}"

info "pushing ${RELEASE_BRANCH} + tag ${tag} to ${REMOTE}..."
git push --follow-tags "${REMOTE}" "${RELEASE_BRANCH}"

cat <<EOF

✓ Released ${tag}.

  The tag push has triggered .github/workflows/release.yml, which will:
    1. verify ${tag} matches package.json (${next_version}),
    2. rebuild + reproducibility-check dist/index.js,
    3. create the GitHub Release, and
    4. retag the floating major alias (e.g. ${tag%%.*}).

  Signing dist with cosign is a SEPARATE, deliberate, dispatch-only step —
  a plain tag push never signs. See release.yml § sign.

  Watch the run:
    gh run watch --workflow=release.yml
EOF
