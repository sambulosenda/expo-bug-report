---
sidebar_position: 3
title: Integrations
---

# Integrations

BugPulse sends reports to one or more integrations. Pass them to `BugReportProvider`.

## BugPulse Proxy (recommended)

Send reports to the BugPulse backend for storage and viewing in the web dashboard.

```tsx
import { ProxyIntegration } from '@bugpulse/react-native';

ProxyIntegration({
  proxyUrl: 'https://your-proxy.your-workers.dev',
  apiKey: 'bp_...',
  timeout: 10000,        // optional, default 10s
  fallbackWebhookUrl: 'https://fallback.com/bugs', // optional
})
```

### How it works

1. Report payload is HMAC-SHA256 signed with your API key
2. Screenshots are uploaded separately via `POST /v1/screenshots` (handles large payloads)
3. Report metadata + screenshot ID sent to `POST /v1/reports`
4. If the proxy returns 402 (plan limits exceeded), falls back to `fallbackWebhookUrl` if configured

### Setup

1. Run `npx @bugpulse/cli signup` to create an account
2. You'll get a proxy URL and API key
3. Run `npx @bugpulse/cli open` to open the dashboard

## Slack

Send bug reports to a Slack channel via webhook.

```tsx
import { SlackIntegration } from '@bugpulse/react-native';

SlackIntegration({
  webhookUrl: 'https://hooks.slack.com/services/T.../B.../xxx',
  imageUploadKey: 'your-imgbb-api-key', // optional, for screenshot uploads
  imageUploadUrl: 'https://api.imgbb.com/1/upload', // optional, default imgbb
})
```

### What you get in Slack

Each bug report appears as a structured message with:
- Description, screen name, device info
- **Navigation timeline:** `/home -> /cart -> /checkout`
- **App state:** latest snapshot per tracked store
- **Error info:** if an error was caught by the error boundary
- Screenshot (if imgbb key configured)

### Screenshot uploads

Slack webhooks can't receive images directly. BugPulse uploads screenshots to imgbb (free image hosting) and includes the URL in the Slack message.

1. Get a free API key at [imgbb.com](https://api.imgbb.com/)
2. Pass it as `imageUploadKey`

Without an imgbb key, reports are still sent but without the screenshot image.

## Webhook

Send the full bug report JSON to any HTTP endpoint.

```tsx
import { WebhookIntegration } from '@bugpulse/react-native';

WebhookIntegration({
  url: 'https://your-api.com/bugs',
  headers: { Authorization: 'Bearer ...' },
  maxPayloadBytes: 1_000_000, // optional, default 1MB
})
```

The webhook receives a POST with:
- All bug report fields
- `screenshotBase64` and `annotatedScreenshotBase64` (base64-encoded images)
- Full `diagnostics` object with state snapshots, nav history, and error info

If the screenshot base64 exceeds `maxPayloadBytes`, it's omitted and a `screenshotSkipped: true` flag is added.

### Example: log to console (development)

```tsx
const ConsoleIntegration: Integration = {
  name: 'console',
  async send(report) {
    console.log('Bug report:', JSON.stringify(report, null, 2));
    return { success: true };
  },
};
```

## Custom Integration

Implement the `Integration` interface:

```tsx
import type { Integration, BugReport, SendResult } from '@bugpulse/react-native';

const MyIntegration: Integration = {
  name: 'my-integration',
  async send(report: BugReport): Promise<SendResult> {
    // report.diagnostics.stateSnapshots — array of { name, state, timestamp, truncated }
    // report.diagnostics.navHistory — array of { pathname, segments, timestamp }
    // report.diagnostics.lastError — { message, stack, componentStack, timestamp } | null

    const response = await fetch('https://my-api.com/bugs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });

    return {
      success: response.ok,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  },
};
```

## Multiple Integrations

Pass multiple integrations to send reports to all of them simultaneously:

```tsx
<BugReportProvider
  integrations={[
    SlackIntegration({ webhookUrl: '...' }),
    WebhookIntegration({ url: '...' }),
    MyCustomIntegration,
  ]}
>
```

Reports are sent to all integrations via `Promise.allSettled`. If one fails, the others still succeed.

## Timeline Viewer

Every bug report includes diagnostics as structured JSON. You can visualize it:

1. Open `viewer/index.html` from the repo (or the hosted version)
2. Paste the bug report JSON
3. See a visual timeline of navigation, state changes, and errors

The viewer renders everything client-side with no server. Safe for sensitive data.
