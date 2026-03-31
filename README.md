# BugPulse

Lightweight in-app bug reporting for React Native & Expo. Shake to report. Annotate screenshots. Auto-capture app state, navigation history, console logs, and JS errors. View and manage reports in a web dashboard.

## What makes this different

Every bug report automatically includes what cross-platform tools don't capture:
- **Zustand/Redux state snapshots** at the moment of the shake (not when the user hits submit)
- **Expo Router navigation history** (last 10 routes)
- **JS error boundary data** (last caught error + component stack)
- **Console log capture** (warnings and errors, ring buffer of last 20)
- **Expo Push Token** (auto-captured from expo-notifications)
- **Severity detection** (crash/error/feedback, auto-classified)
- Device info, screenshot with annotation, and user description

## Platform

BugPulse is a monorepo with four packages:

| Package | What it does |
|---------|-------------|
| `@bugpulse/react-native` | SDK. Shake-to-report, annotation, diagnostics capture |
| `packages/dashboard` | Astro web dashboard on Cloudflare Pages. View reports, manage team, analytics |
| `packages/proxy` | Cloudflare Workers backend. Report storage (D1), auth, Stripe billing, team invites |
| `packages/cli` | CLI tool. `signup`, `open` (dashboard), `invite` (team members) |

## Install

```bash
npx expo install @bugpulse/react-native react-native-view-shot react-native-svg react-native-gesture-handler expo-sensors expo-device expo-constants
```

## Quick Start

```tsx
import { BugReportProvider, SlackIntegration } from '@bugpulse/react-native';

export default function App() {
  return (
    <BugReportProvider
      integrations={[
        SlackIntegration({
          webhookUrl: 'https://hooks.slack.com/services/...',
          imageUploadKey: 'your-imgbb-api-key',
        }),
      ]}
    >
      <YourApp />
    </BugReportProvider>
  );
}
```

Shake your phone. That's it.

## RN-Specific Diagnostics

### State Capture (Zustand)

Track Zustand stores to include state snapshots in every bug report:

```tsx
import { trackStore } from '@bugpulse/react-native';
import { useAppStore } from './stores/app';

// Call once at app startup
trackStore(useAppStore, { name: 'app' });

// Track multiple stores
trackStore(useCartStore, { name: 'cart' });
```

State is captured at shake time (frozen before the user annotates), so the report reflects the app state when the bug occurred, not when the user hit submit.

Call `untrackStore('app')` to stop tracking a store and free the subscription.

**Privacy:** Use `redactStateKeys(['user.password', 'user.token'])` to redact sensitive fields before they're captured. Supports dot-notation paths for nested objects. Call `clearRedactedKeys()` to reset.

### Navigation History (Expo Router)

Auto-captures route changes when using Expo Router:

```tsx
import { useNavigationTracker } from '@bugpulse/react-native';

// Add to your root layout
export default function RootLayout() {
  useNavigationTracker();

  return <Slot />;
}
```

Each bug report includes the last 10 routes with pathnames and timestamps.

Not using Expo Router? Use the `screenNameProvider` prop on `BugReportProvider` to manually pass the current screen name.

### Error Boundary

Wrap your app (or specific subtrees) to capture JS errors:

```tsx
import { BugPulseErrorBoundary } from '@bugpulse/react-native';

export default function App() {
  return (
    <BugPulseErrorBoundary>
      <BugReportProvider integrations={[...]}>
        <YourApp />
      </BugReportProvider>
    </BugPulseErrorBoundary>
  );
}
```

Caught errors are passively stored and attached to the next bug report. The boundary renders a minimal fallback on error.

## Integrations

### BugPulse Proxy (recommended)

```tsx
import { ProxyIntegration } from '@bugpulse/react-native';

ProxyIntegration({
  proxyUrl: 'https://your-proxy.your-workers.dev',
  apiKey: 'bp_...',
})
```

Reports are sent to the BugPulse proxy (Cloudflare Workers) which stores them in D1 and makes them viewable in the dashboard. Screenshots are uploaded separately to handle large payloads. Requests are HMAC-SHA256 signed. Falls back to webhook if the proxy returns 402 (plan limits).

### Slack

```tsx
SlackIntegration({
  webhookUrl: 'https://hooks.slack.com/services/...',
  imageUploadKey: 'your-imgbb-api-key', // for screenshot uploads
})
```

Slack messages include a truncated summary of diagnostics (last 3 state snapshots, last 5 routes, error info) to fit within webhook payload limits.

### Webhook

```tsx
WebhookIntegration({
  url: 'https://your-api.com/bugs',
  headers: { Authorization: 'Bearer ...' },
})
```

Webhook payloads include the full diagnostics object with all state snapshots, navigation history, and error data.

### Custom

```tsx
const MyIntegration: Integration = {
  name: 'my-integration',
  async send(report) {
    // report.diagnostics.stateSnapshots — array of { name, state, timestamp, truncated }
    // report.diagnostics.navHistory — array of { pathname, segments, timestamp }
    // report.diagnostics.lastError — { message, stack, componentStack, timestamp } | null
    return { success: true };
  },
};
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `integrations` | `Integration[]` | required | Where bug reports are sent |
| `metadata` | `Record<string, string>` or `() => Record` | `{}` | App context (user ID, plan, etc.) |
| `shakeThreshold` | `number` | `1.8` | Accelerometer sensitivity |
| `shakeEnabled` | `boolean` | `true` | Enable/disable shake trigger |
| `screenNameProvider` | `() => string` | auto-detect | Current screen name |
| `colorScheme` | `'light' \| 'dark'` | auto-detect | Override dark/light mode |
| `enabled` | `boolean` | `true` | Enable/disable the SDK entirely |

## Console Capture

Capture `console.warn` and `console.error` calls and include them in bug reports:

```tsx
import { startConsoleCapture, stopConsoleCapture, getConsoleLogs } from '@bugpulse/react-native';

// Call at app startup
startConsoleCapture();

// Logs are automatically included in bug report diagnostics
// To read them manually:
const logs = getConsoleLogs(); // last 20 entries

// Cleanup
stopConsoleCapture();
```

## Severity Detection

Auto-classify reports by severity:

```tsx
import { detectSeverity } from '@bugpulse/react-native';

const severity = detectSeverity(report);
// Returns: 'crash' (ErrorBoundary caught), 'error' (description matches error keywords), or 'feedback'
```

## Repro Steps

Generate a timeline of what happened before the bug:

```tsx
import { generateReproSteps } from '@bugpulse/react-native';

const steps = generateReproSteps(diagnostics);
// Returns numbered steps with timestamps: navigation, state changes, errors
```

## Programmatic Trigger

```tsx
import { useBugReport } from '@bugpulse/react-native';

function SettingsScreen() {
  const { triggerBugReport } = useBugReport();

  return (
    <Button title="Report Bug" onPress={triggerBugReport} />
  );
}
```

## How It Works

1. User shakes phone (or triggers programmatically)
2. SDK freezes state snapshots and navigation history
3. SDK captures a screenshot
4. User annotates the screenshot (draw circles, arrows)
5. User adds a description
6. SDK collects device info, attaches diagnostics, and sends to your integrations

## Dark Mode

The bug report modal automatically adapts to the device's color scheme. To override:

```tsx
<BugReportProvider colorScheme="dark" integrations={[...]}>
```

## Optional Dependencies

These add extra functionality but aren't required:

| Package | What it adds |
|---------|-------------|
| `expo-router` | Auto navigation tracking |
| `expo-haptics` | Haptic feedback on shake detection |
| `expo-clipboard` | Copy-to-clipboard fallback when send fails |
| `@react-native-community/netinfo` | Offline detection warning |

Install any you want:

```bash
npx expo install expo-haptics expo-clipboard @react-native-community/netinfo
```

## Timeline Viewer

Every bug report includes diagnostics as structured JSON. Open `viewer/index.html` in a browser and paste the JSON to see a visual timeline of navigation, state changes, and errors.

## Security

**Webhook URL and API key exposure:** Slack webhook URLs and imgbb API keys configured in the SDK live in the app's JavaScript bundle. Anyone with access to your app binary could extract them. This is a known limitation of the zero-backend architecture.

Mitigations:
- Slack webhooks are write-only (can't read channel history)
- Rotate webhook URLs if compromised (Slack settings)
- For production apps handling sensitive data, consider routing reports through a serverless proxy (e.g., Cloudflare Worker) that holds credentials server-side

**State snapshot privacy:** Use `redactStateKeys()` to exclude sensitive fields from state snapshots before they're captured. See the State Capture section above.

## Requirements

- Expo SDK 50+
- React Native 0.72+
- Dev build required for screenshots (Expo Go gets graceful degradation)
- Expo Router (optional, for auto navigation tracking)

## License

MIT
