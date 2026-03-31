---
slug: /
sidebar_position: 1
title: Getting Started
---

# Getting Started

BugPulse is an open-source, in-app bug reporting SDK for React Native and Expo. Shake your phone to report a bug with an annotated screenshot, and every report automatically includes your Zustand/Redux state, navigation history, and JS error data.

## Install

```bash
npx expo install @bugpulse/react-native react-native-view-shot react-native-svg react-native-gesture-handler expo-sensors expo-device expo-constants
```

### Optional dependencies

These add extra features but aren't required:

| Package | What it adds |
|---------|-------------|
| `expo-router` | Auto navigation tracking |
| `expo-haptics` | Haptic feedback on shake |
| `expo-clipboard` | Copy-to-clipboard fallback |
| `@react-native-community/netinfo` | Offline detection warning |

```bash
npx expo install expo-haptics expo-clipboard @react-native-community/netinfo
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

## Add State Tracking

Track Zustand stores to include state snapshots in every bug report:

```tsx
import { trackStore } from '@bugpulse/react-native';
import { useAppStore } from './stores/app';

// Call once at app startup
trackStore(useAppStore, { name: 'app' });
```

State is captured at shake time, so the report reflects the app state when the bug occurred, not when the user hit submit.

## Add Navigation Tracking

Auto-capture route changes with Expo Router:

```tsx
import { useNavigationTracker } from '@bugpulse/react-native';

export default function RootLayout() {
  useNavigationTracker();
  return <Slot />;
}
```

Each bug report includes the last 10 routes with pathnames and timestamps. The current screen name is auto-detected from the last tracked route.

## Add Error Boundary

Wrap your app to capture JS errors:

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

Caught errors are stored and attached to the next bug report automatically.

## Try the Example App

```bash
git clone https://github.com/sambulosenda/expo-bug-report.git
cd expo-bug-report/example
npm install
npx expo start
```

The example app has a cart with Zustand, multiple screens with Expo Router, and a crash test button.

## How It Works

1. User shakes phone (or triggers programmatically)
2. SDK freezes state snapshots and navigation history
3. SDK captures a screenshot
4. User annotates the screenshot (draw with multiple colors)
5. User adds a description (sees a diagnostics summary)
6. SDK collects device info, attaches everything, sends to integrations

## Dashboard Setup

View and manage reports in a web dashboard:

```bash
# Create an account and get your API key
npx @bugpulse/cli signup

# Use ProxyIntegration instead of (or alongside) Slack
import { ProxyIntegration } from '@bugpulse/react-native';

<BugReportProvider integrations={[ProxyIntegration({ proxyUrl: '...', apiKey: 'bp_...' })]}>
```

Open the dashboard: `npx @bugpulse/cli open`

Invite team members: `npx @bugpulse/cli invite teammate@company.com`

## Requirements

- Expo SDK 50+
- React Native 0.72+
- Dev build required for screenshots (Expo Go gets graceful degradation)
