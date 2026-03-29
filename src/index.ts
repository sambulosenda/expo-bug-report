export { BugReportProvider, useBugReport } from './BugReportProvider';
export { SlackIntegration } from './integrations/slack';
export { WebhookIntegration } from './integrations/webhook';
export { ProxyIntegration } from './integrations/proxy';
export { trackStore, untrackStore, redactStateKeys, clearRedactedKeys } from './StateCapture';
export { useNavigationTracker } from './NavigationTracker';
export { BugPulseErrorBoundary } from './ErrorBoundary';
export { useThemeColors } from './useThemeColors';
export type { ThemeColors } from './useThemeColors';
export type {
  Integration,
  BugReport,
  DeviceInfo,
  SendResult,
  IssueLinkInfo,
  Diagnostics,
  StateSnapshot,
  NavEntry,
  ErrorInfo,
} from './integrations/types';
