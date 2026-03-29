---
sidebar_position: 4
title: FAQ
---

# FAQ

## Does it work with Expo Go?

Partially. Screenshot capture requires a dev build (Expo Go doesn't support `react-native-view-shot`). When running in Expo Go, BugPulse gracefully degrades: the bug report still collects the description, device info, state snapshots, nav history, and error data, but skips the screenshot.

For the full experience including screenshots and annotation, use a dev build:

```bash
npx expo run:ios
# or
npx expo run:android
```

## Does it work without Expo Router?

Yes. Navigation tracking (`useNavigationTracker`) requires Expo Router, but everything else works without it. If you're not using Expo Router:

- Skip `useNavigationTracker()`
- Pass a `screenNameProvider` prop to tell BugPulse the current screen name

```tsx
<BugReportProvider
  screenNameProvider={() => getCurrentScreenName()}
  integrations={[...]}
>
```

## What state management libraries are supported?

Any library with a Zustand-compatible API (`subscribe` + `getState`):
- **Zustand** (native support)
- **Redux** (via `store.subscribe` and `store.getState`)
- **Jotai** (via `useStore` hook)

```tsx
// Redux example
trackStore(reduxStore, { name: 'redux' });
```

## How much does it affect performance?

Minimal impact:
- **Bundle size:** ~15KB gzipped (SDK code only, excluding peer deps)
- **Init time:** < 50ms (accelerometer subscription + store subscriptions)
- **State tracking:** each state change serializes to JSON (< 1ms for typical stores under 50KB)
- **Screenshot capture:** ~200ms async (react-native-view-shot)
- **Memory:** ring buffers are capped at 10 entries per store, 10 nav entries

## Is my state data safe?

State snapshots are sent as-is to your configured integrations (Slack webhook, custom webhook). BugPulse does not send data to any BugPulse servers. There is no backend.

**Important:** Do not track stores containing passwords, auth tokens, or PII. A redaction API is planned for a future release.

## Are my webhook URLs safe?

Slack webhook URLs and imgbb API keys configured in the SDK live in the app's JavaScript bundle. Anyone with access to your app binary could extract them. This is a known limitation of the zero-backend architecture.

Mitigations:
- Slack webhooks are write-only (can't read channel history)
- Rotate webhook URLs if compromised
- For production apps, consider routing through a serverless proxy (Cloudflare Worker free tier)

## Can I trigger reports programmatically?

Yes, use the `useBugReport` hook:

```tsx
const { triggerBugReport } = useBugReport();
// Call triggerBugReport() from a button, menu, or gesture
```

## Does it support dark mode?

Yes. The bug report modal auto-detects the device color scheme. Override with the `colorScheme` prop:

```tsx
<BugReportProvider colorScheme="dark" integrations={[...]}>
```

## How do I customize the annotation colors?

The annotation canvas includes a 4-color picker (red, blue, yellow, white) in the toolbar. Users can switch colors while annotating. This is built in, no configuration needed.

## What happens if the send fails?

1. The user sees a "Failed to send" screen with the error message
2. They can retry (up to 3 times)
3. If all retries fail and `expo-clipboard` is installed, they can copy the report text to clipboard
4. If offline, they see a warning before submitting (requires `@react-native-community/netinfo`)

## Can I use it in production?

Yes. BugPulse is designed for production use. The shake detection, state capture, and screenshot capture all run with minimal overhead. The SDK degrades gracefully when optional features aren't available.

## License

MIT. Free for personal and commercial use.
