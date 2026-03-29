# @bugpulse/react-native

Lightweight in-app bug reporting for React Native & Expo. Shake to report. Annotate screenshots. Auto-capture app state, navigation history, and JS errors. Send to Slack or any webhook.

## What makes this different

Every bug report automatically includes what cross-platform tools don't capture:
- **Zustand/Redux state snapshots** at the moment of the shake (not when the user hits submit)
- **Expo Router navigation history** (last 10 routes)
- **JS error boundary data** (last caught error + component stack)
- Device info, screenshot with annotation, and user description

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

**Privacy note:** State snapshots are sent as-is. Do not track stores containing passwords, auth tokens, or PII. A redaction API is planned for a future release.

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
| `enabled` | `boolean` | `true` | Enable/disable the SDK entirely |

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

## Requirements

- Expo SDK 50+
- React Native 0.72+
- Dev build required for screenshots (Expo Go gets graceful degradation)
- Expo Router (optional, for auto navigation tracking)

## License

MIT
