export { BugReportProvider, useBugReport } from './BugReportProvider';
export { SlackIntegration } from './integrations/slack';
export { WebhookIntegration } from './integrations/webhook';
export { trackStore, untrackStore } from './StateCapture';
export { useNavigationTracker } from './NavigationTracker';
export { BugPulseErrorBoundary } from './ErrorBoundary';
export { useThemeColors } from './useThemeColors';
export type { ThemeColors } from './useThemeColors';
export type {
  Integration,
  BugReport,
  DeviceInfo,
  SendResult,
  Diagnostics,
  StateSnapshot,
  NavEntry,
  ErrorInfo,
} from './integrations/types';
