export { BugReportProvider, useBugReport } from './BugReportProvider';
export { SlackIntegration } from './integrations/slack';
export { WebhookIntegration } from './integrations/webhook';
export { ProxyIntegration } from './integrations/proxy';
export { trackStore, untrackStore, redactStateKeys, clearRedactedKeys } from './StateCapture';
export { useNavigationTracker } from './NavigationTracker';
export { BugPulseErrorBoundary } from './ErrorBoundary';
export { generateReproSteps } from './ReproSteps';
export { detectSeverity } from './Severity';
export { useThemeColors } from './useThemeColors';
export { startConsoleCapture, stopConsoleCapture, getConsoleLogs } from './ConsoleCapture';
export type { ThemeColors } from './useThemeColors';
export type { ConsoleEntry } from './ConsoleCapture';
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
  ReportSeverity,
  ConsoleLogEntry,
} from './integrations/types';
