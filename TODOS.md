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

## Redux DevTools-compatible state export
**Status:** TODO
**Priority:** Medium
**What:** Add option to export state history in Redux DevTools Import State format alongside the custom timeline viewer.
**Why:** Developers already use Redux DevTools/Reactotron. Native format means zero learning curve for replaying state transitions.
**Context:** CEO review deferred this. Custom viewer ships in v1. Zustand's subscribe API doesn't provide action names, so DevTools format requires middleware changes to capture actions. Build as v2 headline feature if users request it.
**Depends on:** v1 launch + user feedback indicating demand for DevTools integration.
**Added:** 2026-03-29 via /plan-eng-review (CEO review expansion deferred)

## Offline report queueing
**Status:** TODO
**Priority:** Low
**What:** When offline, queue bug reports to AsyncStorage and retry when connectivity returns.
**Why:** v1 warns-and-discards. If users report lost reports, queueing prevents data loss on intermittent connectivity.
**Context:** v1 shows offline warning via NetInfo (optional dep). User can still submit (may succeed if network recovers). AsyncStorage has ~6MB limit on Android, need queue overflow handling. Only build if discard-on-offline causes real complaints.
**Depends on:** v1 launch + user feedback about lost reports.
**Added:** 2026-03-29 via /plan-eng-review (CEO review expansion deferred)

## Module-level singleton refactor
**Status:** TODO
**Priority:** Low
**What:** Replace module-level mutable state in StateCapture, NavigationTracker, and ErrorBoundary with instance-scoped state tied to BugReportProvider context.
**Why:** Current design uses module-level singletons (frozenSnapshot, navBuffer, lastError). This prevents multiple independent BugReportProvider instances, leaks state between tests unless manually reset, and can produce stale state on hot reload.
**Context:** Not blocking v1 (single provider is the expected use case). Becomes relevant if SDK is adopted in monorepo/multi-app setups or if test isolation becomes painful. L-sized refactor touching 3 core modules + all tests. Breaking change for trackStore() API.
**Depends on:** v1 adoption. Only worth doing if users hit the limitation.
**Added:** 2026-03-29 via /plan-eng-review (outside voice finding)
