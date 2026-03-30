# Changelog

All notable changes to BugPulse will be documented in this file.

## [1.1.0.0] - 2026-03-30

### Added
- **Stripe Checkout endpoint** (`POST /v1/checkout`) for dynamic subscription creation with plan selection
- **Web dashboard** on Cloudflare Pages (Astro) with report list, detail view, severity/status filters, and 15s auto-refresh
- **Report persistence layer** so the dashboard can display full report content (description, diagnostics, screenshots)
- **Session-based auth** for dashboard login, separate from API key auth (API keys never stored in cookies)
- **Team invite system** with magic link emails via Resend, so non-dev team members can access the dashboard
- **Dashboard report detail view** with navigation history, state snapshots, console logs, device info, and screenshot viewer
- **Report status management** (new/triaged/fixed) via dashboard dropdown or `PATCH /v1/reports/:id`
- **Push token auto-capture** from expo-notifications (optional peer dep), included in report payloads automatically
- **CLI `open` command** to launch the dashboard in your default browser
- **CLI `invite` command** to invite team members to the dashboard
- **Public stats endpoint** (`GET /v1/stats/public`) for landing page social proof (cached, rate-limited)
- **D1 migration** (`0003_dashboard.sql`) with `reports`, `sessions`, `team_members`, and `magic_tokens` tables
