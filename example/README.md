# BugPulse Example App

A demo Expo app showing BugPulse in action. Shake your phone to file a bug report with state snapshots, navigation history, and error boundary data.

## Quick Start

```bash
cd example
npm install
npx expo start
```

Scan the QR code with Expo Go, or press `i` for iOS simulator / `a` for Android emulator.

## What to Try

1. **Add items to cart** — tap products on the home screen
2. **Navigate around** — go to Cart, back to Home
3. **Shake your phone** — the bug report modal opens with a screenshot
4. **Annotate** — draw on the screenshot, try different colors
5. **Submit** — check the webhook endpoint to see the full report

The report includes:
- Your Zustand cart state at the moment of the shake
- Navigation history (last 10 routes)
- Device info, screenshot, and your description

## Test Error Boundary

Tap "Trigger JS Error" on the home screen. The error boundary catches it. The next bug report you file will include the error info automatically.

## Configuration

Edit `app/_layout.tsx` to:
- Add your Slack webhook URL
- Add your imgbb API key (for screenshot uploads to Slack)
- Track additional Zustand stores
