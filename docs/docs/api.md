---
sidebar_position: 2
title: API Reference
---

# API Reference

## BugReportProvider

The main wrapper component. Place it near the root of your app.

```tsx
<BugReportProvider
  integrations={[SlackIntegration({ webhookUrl: '...' })]}
  metadata={{ userId: '123' }}
  shakeThreshold={1.8}
  shakeEnabled={true}
  colorScheme="dark"
  enabled={true}
  onError={(error, report) => console.log(error)}
>
  <YourApp />
</BugReportProvider>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `integrations` | `Integration[]` | required | Where bug reports are sent |
| `metadata` | `Record<string, string>` or `() => Record` | `{}` | App context (user ID, plan, etc.) |
| `shakeThreshold` | `number` | `1.8` | Accelerometer sensitivity |
| `shakeEnabled` | `boolean` | `true` | Enable/disable shake trigger |
| `screenNameProvider` | `() => string` | auto-detect | Current screen name (auto-detected from Expo Router if `useNavigationTracker` is active) |
| `colorScheme` | `'light' \| 'dark'` | auto-detect | Override dark/light mode for the bug report modal |
| `enabled` | `boolean` | `true` | Enable/disable the SDK entirely |
| `onError` | `(error: Error, report: BugReport) => void` | — | Called when sending fails |

## useBugReport

Hook to trigger bug reports programmatically.

```tsx
import { useBugReport } from '@bugpulse/react-native';

function SettingsScreen() {
  const { triggerBugReport } = useBugReport();
  return <Button title="Report Bug" onPress={triggerBugReport} />;
}
```

Must be used within a `BugReportProvider`.

## trackStore / untrackStore

Track Zustand or Redux stores for state capture.

```tsx
import { trackStore, untrackStore } from '@bugpulse/react-native';

// Start tracking
trackStore(useAppStore, { name: 'app' });
trackStore(useCartStore, { name: 'cart' });

// Stop tracking
untrackStore('app');
```

### Parameters

| Param | Type | Description |
|-------|------|-------------|
| `store` | `{ subscribe, getState }` | Any store with Zustand-compatible API |
| `options.name` | `string` | Unique name for this store in reports |

State is serialized as JSON. Max 50KB per snapshot. Circular references are handled gracefully. Last 10 state changes are kept in a ring buffer.

**Privacy note:** State snapshots are sent as-is. Do not track stores containing passwords, auth tokens, or PII.

## useNavigationTracker

Hook for auto-tracking Expo Router navigation.

```tsx
import { useNavigationTracker } from '@bugpulse/react-native';

export default function RootLayout() {
  useNavigationTracker();
  return <Slot />;
}
```

Records the last 10 routes with pathname, segments, and timestamp. Max 20KB total. Works only with Expo Router. If Expo Router is not installed, the hook is a safe no-op.

Not using Expo Router? Use the `screenNameProvider` prop on `BugReportProvider` instead.

## BugPulseErrorBoundary

React error boundary that captures JS errors for bug reports.

```tsx
import { BugPulseErrorBoundary } from '@bugpulse/react-native';

<BugPulseErrorBoundary fallback={<MyErrorScreen />}>
  <App />
</BugPulseErrorBoundary>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | required | Your app |
| `fallback` | `ReactNode` | "Something went wrong" | Custom error screen |

Caught errors (message, stack, component stack) are stored and attached to the next bug report.

## useThemeColors

Hook for accessing the BugPulse color palette. Useful if you want to build custom UI that matches the bug report modal.

```tsx
import { useThemeColors } from '@bugpulse/react-native';

const colors = useThemeColors('dark'); // or 'light', or undefined for auto
```

Returns a `ThemeColors` object with `background`, `surface`, `border`, `text`, `textSecondary`, `primary`, `error`, etc.

## startConsoleCapture / stopConsoleCapture / getConsoleLogs

Capture `console.warn` and `console.error` calls. Captured logs are automatically included in bug report diagnostics.

```tsx
import { startConsoleCapture, stopConsoleCapture, getConsoleLogs } from '@bugpulse/react-native';

startConsoleCapture();   // Start intercepting console.warn/error
const logs = getConsoleLogs(); // Returns ConsoleLogEntry[] (last 20)
stopConsoleCapture();    // Stop intercepting, restore originals
```

### ConsoleLogEntry

```typescript
interface ConsoleLogEntry {
  level: 'warn' | 'error';
  message: string;
  timestamp: string;
}
```

## redactStateKeys / clearRedactedKeys

Redact sensitive fields from state snapshots before they're captured.

```tsx
import { redactStateKeys, clearRedactedKeys } from '@bugpulse/react-native';

// Redact nested paths with dot notation
redactStateKeys(['user.password', 'user.token', 'auth.refreshToken']);

// Clear all redaction rules
clearRedactedKeys();
```

Redacted fields appear as `"[REDACTED]"` in state snapshots.

## detectSeverity

Auto-classify a bug report's severity.

```tsx
import { detectSeverity } from '@bugpulse/react-native';

const severity = detectSeverity(report);
// 'crash' — ErrorBoundary caught an error
// 'error' — description matches error keywords
// 'feedback' — default
```

### ReportSeverity

```typescript
type ReportSeverity = 'crash' | 'error' | 'feedback';
```

## generateReproSteps

Generate a human-readable timeline of events leading up to the bug.

```tsx
import { generateReproSteps } from '@bugpulse/react-native';

const steps = generateReproSteps(diagnostics);
// Returns: "1. [10:32:01] Navigated to /cart\n2. [10:32:05] State changed: cart..."
```

## getExpoPushToken / getCachedPushToken

Get the Expo Push Token (requires `expo-notifications` as a peer dependency).

```tsx
import { getExpoPushToken, getCachedPushToken } from '@bugpulse/react-native';

// Async — requests permission and fetches token
const token = await getExpoPushToken();

// Sync — returns cached value (null if not yet fetched)
const cached = getCachedPushToken();
```

The push token is automatically included in bug reports when using `ProxyIntegration`.

## Types

### BugReport

```typescript
interface BugReport {
  screenshot: string | null;
  annotatedScreenshot: string | null;
  description: string;
  device: DeviceInfo;
  screen: string;
  timestamp: string;
  metadata: Record<string, string>;
  diagnostics?: Diagnostics;
}
```

### Diagnostics

```typescript
interface Diagnostics {
  stateSnapshots: StateSnapshot[];
  navHistory: NavEntry[];
  lastError: ErrorInfo | null;
}
```

### Integration

```typescript
interface Integration {
  name: string;
  send(report: BugReport): Promise<SendResult>;
}
```

Build custom integrations by implementing this interface. See [Integrations](/integrations) for details.

### ConsoleLogEntry

```typescript
interface ConsoleLogEntry {
  level: 'warn' | 'error';
  message: string;
  timestamp: string;
}
```

### ReportSeverity

```typescript
type ReportSeverity = 'crash' | 'error' | 'feedback';
```
