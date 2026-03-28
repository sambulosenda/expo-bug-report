# expo-bug-report

Lightweight in-app bug reporting for React Native & Expo. Shake to report. Annotate screenshots. Send to Slack or any webhook.

## Features

- Shake detection (accelerometer-based, no native modules)
- Screenshot capture with draw-on-screen annotation
- Device info collection (model, OS, app version, screen size)
- Pluggable integrations (Slack, webhook, more coming)
- 3 lines of code to set up

## Install

```bash
npx expo install expo-bug-report react-native-view-shot react-native-svg react-native-gesture-handler expo-sensors expo-device expo-constants
```

## Quick Start

```tsx
import { BugReportProvider, SlackIntegration } from 'expo-bug-report';

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

## Integrations

### Slack

```tsx
SlackIntegration({
  webhookUrl: 'https://hooks.slack.com/services/...',
  imageUploadKey: 'your-imgbb-api-key', // for screenshot uploads
})
```

### Webhook

```tsx
WebhookIntegration({
  url: 'https://your-api.com/bugs',
  headers: { Authorization: 'Bearer ...' },
})
```

### Custom

```tsx
const MyIntegration: Integration = {
  name: 'my-integration',
  async send(report) {
    // report.screenshot, report.annotatedScreenshot, report.description,
    // report.device, report.screen, report.timestamp, report.metadata
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
import { useBugReport } from 'expo-bug-report';

function SettingsScreen() {
  const { triggerBugReport } = useBugReport();

  return (
    <Button title="Report Bug" onPress={triggerBugReport} />
  );
}
```

## How It Works

1. User shakes phone (or triggers programmatically)
2. SDK captures a screenshot
3. User annotates the screenshot (draw circles, arrows)
4. User adds a description
5. SDK collects device info and sends to your integrations

## Requirements

- Expo SDK 50+
- React Native 0.72+
- Dev build required for screenshots (Expo Go gets graceful degradation)

## License

MIT
