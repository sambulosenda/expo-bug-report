# Contributing to BugPulse

Thanks for wanting to help improve BugPulse! This guide covers everything you need to get started.

## Setup

```bash
git clone https://github.com/sambulosenda/expo-bug-report.git
cd expo-bug-report
npm install --legacy-peer-deps
```

## Development

```bash
# Run tests
npm test

# Type check
npx tsc --skipLibCheck --noEmit

# Build
npm run build
```

## Project Structure

```
src/                         # React Native SDK
  BugReportProvider.tsx      # Main context provider + shake trigger
  BugReportModal.tsx         # Bug report UI (annotate, describe, submit)
  AnnotationCanvas.tsx       # Screenshot annotation with drawing
  ShakeDetector.ts           # Accelerometer-based shake detection
  ScreenCapture.ts           # Screenshot via react-native-view-shot
  StateCapture.ts            # Zustand/Redux state tracking + redaction
  NavigationTracker.ts       # Expo Router navigation history
  ErrorBoundary.tsx          # JS error boundary
  ConsoleCapture.ts          # Console.warn/error capture
  Severity.ts               # Auto severity detection (crash/error/feedback)
  ReproSteps.ts              # Repro steps generation from diagnostics
  PushToken.ts               # Expo Push Token capture
  DeviceInfo.ts              # Device metadata collection
  RingBuffer.ts              # Fixed-size circular buffer
  useThemeColors.ts          # Dark/light mode color palette
  integrations/
    slack.ts                 # Slack webhook integration
    webhook.ts               # Generic webhook integration
    proxy.ts                 # BugPulse proxy integration (HMAC signed)
    types.ts                 # Shared TypeScript types
  __tests__/                 # Jest + RNTL test suite
packages/
  dashboard/                 # Astro web dashboard (Cloudflare Pages)
    src/pages/               # Report list, detail, team, integrations
    src/layouts/             # Layout with icon rail navigation
  proxy/                     # Cloudflare Workers backend
    src/index.ts             # API routes, D1 storage, auth, Stripe
  cli/                       # CLI tool
    src/index.ts             # signup, open, invite commands
viewer/
  index.html                 # Timeline viewer (static HTML)
```

## Testing

We use Jest with React Native Testing Library. Tests live in `src/__tests__/`.

```bash
# Run all tests
npm test

# Run a specific test file
npx jest src/__tests__/StateCapture.test.ts

# Run with coverage
npx jest --coverage
```

## Pull Requests

1. Fork the repo and create a feature branch
2. Make your changes
3. Add or update tests for any new functionality
4. Ensure `npm test` passes and `npx tsc --skipLibCheck --noEmit` shows no errors
5. Open a PR with a clear description

## Code Style

- TypeScript strict mode
- Functional components with hooks
- Optional dependencies use try/catch dynamic require
- All user-facing text prefixed with `[BugPulse]` in console warnings
- Inline styles (no external stylesheet deps)

## Reporting Issues

Use GitHub Issues. Include:
- What you expected
- What happened
- Steps to reproduce
- Device/OS/Expo SDK version
