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

## Token validation on integration setup
**Status:** TODO
**Priority:** P1
**What:** When a user configures a Linear/GitHub/Jira integration via `POST /v1/integrations`, proxy makes a test API call to validate the token before saving.
**Why:** Without validation, users discover bad tokens only when their first bug report fails to create an issue. Bad UX for a paid feature.
**Context:** Each integration type needs its own validation endpoint (Linear: `GET /v1/me`, GitHub: `GET /user`, Jira: `GET /rest/api/3/myself`). Adds ~500ms latency to integration setup. Accept as tradeoff for better reliability.
**Effort:** S (CC: ~15 min)
**Depends on:** Proxy baseline with integration CRUD endpoints.
**Added:** 2026-03-29 via /plan-ceo-review (outside voice finding)

## Proxy + fallback double failure handling
**Status:** TODO
**Priority:** P2
**What:** If proxy returns 5xx AND the fallback webhook also fails, the report is currently lost silently. Add a third-level fallback: show error screen with copy-to-clipboard option (existing pattern in BugReportModal).
**Why:** Prevents silent report loss in the (rare) case where both proxy and fallback are down simultaneously.
**Context:** The copy-to-clipboard UI already exists in the error step of BugReportModal. ProxyIntegration needs to surface the error to the modal rather than swallowing it. Alternative: AsyncStorage queue for retry (brings back offline queueing complexity).
**Effort:** S (CC: ~20 min)
**Depends on:** ProxyIntegration with fallback mode.
**Added:** 2026-03-29 via /plan-ceo-review (outside voice finding)

## Console log capture
**Status:** TODO
**Priority:** P2
**What:** Patch console.warn and console.error to capture last 20 entries in a ring buffer, included in bug report diagnostics.
**Why:** Console breadcrumbs show what the app was "thinking" leading up to a bug. Completes the debugging context alongside state + nav.
**Context:** Monkey-patching console in RN interacts with LogBox (which hooks console.error). Needs dedicated testing to avoid suppressing/duplicating warnings. Sentry also patches console; coexistence must be verified. Timestamps required for correlation with nav/state timeline.
**Effort:** S (CC: ~15 min)
**Depends on:** v1 launch + LogBox interaction testing + Sentry coexistence verification.
**Added:** 2026-03-29 via /plan-ceo-review (outside voice deferred)

## Category chips in report modal
**Status:** TODO
**Priority:** P2
**What:** Add tappable category chips (user-defined, not hardcoded) to the bug report modal for structured triage.
**Why:** Structured data enables filtering/routing reports by type. Faster for reporters than free text alone.
**Context:** Deferred from v1 launch because hardcoding categories before having real users means picking wrong ones. v1 ships with freeform text to learn how users naturally describe bugs. After analyzing freeform descriptions from real usage, build chips with data-informed categories. Categories should be configurable by the developer, not fixed.
**Effort:** S (CC: ~20 min)
**Depends on:** v1 launch + analysis of real user bug descriptions to determine categories.
**Added:** 2026-03-29 via /plan-ceo-review (outside voice deferred)

## Performance metrics capture (RN-specific)
**Status:** TODO
**Priority:** P3
**What:** Capture JS thread FPS and memory usage at bug report time, included in diagnostics.
**Why:** Quantitative data for "app was slow" reports where the user can't articulate what happened.
**Context:** performance.memory does NOT exist in React Native (Chrome-only API). FPS via requestAnimationFrame at report time measures the modal animating, not the bug. Continuous background FPS sampling means CPU overhead in prod. Needs research into Hermes profiling APIs or native module bridge for memory. Platform-specific implementation required.
**Effort:** L (human) / M (CC)
**Depends on:** v1 launch + research into available RN/Hermes performance APIs.
**Added:** 2026-03-29 via /plan-ceo-review (outside voice deferred)

## Module-level singleton refactor
**Status:** TODO
**Priority:** Low
**What:** Replace module-level mutable state in StateCapture, NavigationTracker, and ErrorBoundary with instance-scoped state tied to BugReportProvider context.
**Why:** Current design uses module-level singletons (frozenSnapshot, navBuffer, lastError). This prevents multiple independent BugReportProvider instances, leaks state between tests unless manually reset, and can produce stale state on hot reload.
**Context:** Not blocking v1 (single provider is the expected use case). Becomes relevant if SDK is adopted in monorepo/multi-app setups or if test isolation becomes painful. L-sized refactor touching 3 core modules + all tests. Breaking change for trackStore() API.
**Depends on:** v1 adoption. Only worth doing if users hit the limitation.
**Added:** 2026-03-29 via /plan-eng-review (outside voice finding)
