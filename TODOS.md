# TODOS

## GitHub Actions CI/CD for npm publish
**Status:** TODO
**Priority:** High
**What:** Add `.github/workflows/` with: (1) CI on PR (build + test), (2) publish to npm on git tag.
**Why:** Design doc says "GitHub Actions for build + npm publish on tag." Without this, publishing is manual and error-prone. No pipeline = no reproducible releases.
**Context:** The SDK is ready to ship once bug fixes and tests are in. CI should run `tsc` + `jest` on PRs. Publish workflow should trigger on `v*` tags, build, and `npm publish`.
**Depends on:** Test suite must exist first (CI should run tests).
**Added:** 2026-03-28 via /plan-eng-review
