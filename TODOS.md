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
**Status:** IN SCOPE (Phase 2)
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

## Separate screenshot upload endpoint
**Status:** TODO
**Priority:** P1
**What:** SDK uploads screenshot to a dedicated `POST /v1/screenshots` endpoint first, gets back an ID. Then sends the report (small JSON) with the screenshot ID instead of base64 payload.
**Why:** Base64 screenshots can be 3-4MB. Combined with R2 upload and integration API calls on the proxy side, this regularly exceeds the 5s SDK timeout on slow connections, triggering the fallback path. Separating upload from report submission keeps the report request fast.
**Context:** Phase 2 proxy plan. SDK `proxy.ts` currently sends base64 inline. Proxy needs a new endpoint that accepts multipart upload to R2, returns a screenshot ID. Report payload includes `screenshotId` instead of `screenshotBase64`.
**Effort:** S (CC: ~20 min)
**Depends on:** Phase 2 proxy baseline.
**Added:** 2026-03-30 via /plan-ceo-review (outside voice finding)

## CLI configuration UX
**Status:** TODO
**Priority:** P1
**What:** Design and implement CLI commands: `npx @bugpulse/cli signup`, `npx @bugpulse/cli add-integration linear`, `npx @bugpulse/cli status`, `npx @bugpulse/cli health`.
**Why:** First thing a paying customer touches. No dashboard means the CLI IS the management interface. A bad CLI experience kills conversion from free to paid.
**Context:** Phase 2 proxy plan. Needs interactive prompts (ink or prompts library), config file format (.bugpulserc or similar), clear error messages. The CLI calls the proxy API endpoints. Should be a separate npm package (`@bugpulse/cli`).
**Effort:** M (CC: ~30 min)
**Depends on:** Phase 2 proxy baseline API endpoints.
**Added:** 2026-03-30 via /plan-ceo-review (outside voice finding)

## Bidirectional reporter feedback with push notifications
**Status:** TODO
**Priority:** P2
**What:** When a developer acknowledges or closes an issue, the reporter's app shows a notification: "Your report about /checkout was fixed!" Requires push notifications, not polling.
**Why:** Polling-based status checks (the original Phase 2 proposal) have poor UX: reporters may not open the app for days, and stale notifications about old bugs are confusing. Push is the only way to make this feature feel alive.
**Context:** Requires: Expo Push Notifications as optional peer dep, proxy push token registration endpoint, Linear webhook receiver for status updates, push notification dispatch. Deferred from Phase 2 because it fundamentally needs push infrastructure that doesn't exist yet.
**Effort:** L (CC: ~2h)
**Depends on:** Phase 2 proxy baseline + push notification infrastructure decision.
**Added:** 2026-03-30 via /plan-ceo-review (deferred from Phase 2 expansion)

## Stripe payment failure grace period
**Status:** TODO
**Priority:** P1
**What:** When a card declines on renewal, don't immediately lock out. Add 7-day grace period with features still working but banner shown in CLI/issue links.
**Why:** Immediate lockout on payment failure is hostile UX. Standard SaaS practice is 7-day grace period. Prevents churn from temporary card issues.
**Context:** Stripe webhook `invoice.payment_failed` event triggers grace period. Store `grace_expires_at` on users table. During grace: all features work, CLI shows warning, issue links include "(plan expiring)". After grace: auto-downgrade to free. `customer.subscription.deleted` is the hard cutoff.
**Effort:** S (CC: ~15 min)
**Depends on:** Phase 2 Stripe webhook handler.
**Added:** 2026-03-30 via /plan-eng-review (outside voice finding)

## KV caching for dashboard polling
**Status:** TODO
**Priority:** P2
**What:** Add Cloudflare KV cache layer for dashboard polling. Write latest report timestamp to KV on ingest. Dashboard poll checks KV first, only queries D1 if new data exists.
**Why:** D1 queries cost the same regardless of whether data changed. At 50+ concurrent dashboard users polling every 15s, D1 costs become material. KV reads are 10x cheaper.
**Context:** Dashboard polls `GET /v1/reports/recent` every 15s. Without caching, every poll hits D1 even if no new reports. KV key: `latest_report:{user_id}` with timestamp. Poll handler reads KV, returns 304-equivalent if no change. Accept D1 cost at early scale.
**Effort:** S (CC: ~20 min)
**Depends on:** Dashboard shipping + usage growth indicating cost concern.
**Added:** 2026-03-30 via /plan-ceo-review

## Shared API client package
**Status:** TODO
**Priority:** P2
**What:** Extract `@bugpulse/api-client` shared module for CLI, MCP server, and dashboard to import. Covers auth header attachment, error parsing, base URL resolution.
**Why:** Three packages independently implement the same proxy API calling pattern. Drift between implementations causes subtle bugs (different error handling, missing headers).
**Context:** CLI has `apiRequest()`, MCP has fetch calls, dashboard will add a third. Extract after dashboard ships (third consumer makes the abstraction justified). Shared module exports typed functions: `apiClient.getReports()`, `apiClient.createIssue()`, etc.
**Effort:** S (CC: ~30 min)
**Depends on:** Dashboard shipping (third consumer).
**Added:** 2026-03-30 via /plan-ceo-review

## Integration dedup / DRY refactor
**Status:** TODO
**Priority:** P3
**What:** Extract shared integration interface from Linear/GitHub/Jira implementations. Consolidate `ensureLabels`, `formatIssueBody`, and issue creation into pluggable pattern.
**Why:** Three integrations (~85-90 lines each) are copy-pasted with slight variations. Three `ensureLabels` implementations. Adding a field (e.g., "Environment") requires changes in 3+ places. Dashboard "Create Issue" button will reuse this code.
**Context:** Current pattern works but violates DRY aggressively. Extract `IntegrationAdapter` interface with `createIssue(report)`, `formatBody(report)`, `ensureLabels(labels)`. Data-driven body templates instead of per-integration formatters.
**Effort:** M (CC: ~45 min)
**Depends on:** Next time integrations are modified.
**Added:** 2026-03-30 via /plan-ceo-review (taste calibration finding)
