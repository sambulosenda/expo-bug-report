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
src/
  BugReportProvider.tsx    # Main context provider + shake trigger
  BugReportModal.tsx       # Bug report UI (annotate, describe, submit)
  AnnotationCanvas.tsx     # Screenshot annotation with drawing
  ShakeDetector.ts         # Accelerometer-based shake detection
  ScreenCapture.ts         # Screenshot via react-native-view-shot
  StateCapture.ts          # Zustand/Redux state tracking
  NavigationTracker.ts     # Expo Router navigation history
  ErrorBoundary.tsx        # JS error boundary
  DeviceInfo.ts            # Device metadata collection
  RingBuffer.ts            # Fixed-size circular buffer
  useThemeColors.ts        # Dark/light mode color palette
  integrations/
    slack.ts               # Slack webhook integration
    webhook.ts             # Generic webhook integration
    types.ts               # Shared TypeScript types
  utils/
    fileToBase64.ts        # File to base64 encoding
  __tests__/               # Jest + RNTL test suite
viewer/
  index.html               # Timeline viewer (static HTML)
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
