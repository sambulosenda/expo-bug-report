# TODOS

## GitHub Actions CI/CD for npm publish
**Status:** DONE
**Priority:** High
**What:** Add `.github/workflows/` with: (1) CI on PR (build + test), (2) publish to npm on git tag.
**Why:** Design doc says "GitHub Actions for build + npm publish on tag." Without this, publishing is manual and error-prone. No pipeline = no reproducible releases.
**Context:** CI runs `tsc` + `jest` on PRs. Publish workflow triggers on `v*` tags, builds, and `npm publish`.
**Completed:** 2026-03-29 via /plan-eng-review

## Bare React Navigation support
**Status:** TODO
**Priority:** Medium
**What:** Add `<BugPulseNavigationContainer>` wrapper for non-Expo-Router projects using bare React Navigation.
**Why:** Expands addressable market beyond Expo-only developers. Current nav tracking only works with Expo Router.
**Context:** v1 targets Expo Router as primary (usePathname/useSegments hooks). Bare RN users fall back to the existing `screenNameProvider` prop. If post-launch feedback shows demand from bare RN users, build the wrapper.
**Depends on:** v1 launch + user feedback indicating demand.
**Added:** 2026-03-29 via /plan-eng-review

## State redaction API
**Status:** TODO
**Priority:** Medium
**What:** Add `BugPulse.redactStateKeys(['user.email', 'auth.token'])` to strip PII from state snapshots before they're included in bug reports.
**Why:** Redux/Zustand state may contain PII. v1 ships with a README warning to only track stores without sensitive data. If users request PII filtering, this API enables safe tracking of auth/user stores.
**Context:** Requires deep key-path traversal + redaction logic in StateCapture module. v1 mitigates by documenting the limitation.
**Depends on:** v1 launch + user feedback.
**Added:** 2026-03-29 via /plan-eng-review
