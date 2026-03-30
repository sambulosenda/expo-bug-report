export interface StateSnapshot {
  name: string;
  state: string;
  timestamp: string;
  truncated: boolean;
}

export interface NavEntry {
  pathname: string;
  segments: string[];
  timestamp: string;
}

export interface ErrorInfo {
  message: string;
  stack: string | null;
  componentStack: string | null;
  timestamp: string;
}

export interface ConsoleLogEntry {
  level: 'warn' | 'error';
  message: string;
  timestamp: string;
}

export interface Diagnostics {
  stateSnapshots: StateSnapshot[];
  navHistory: NavEntry[];
  lastError: ErrorInfo | null;
  consoleLogs?: ConsoleLogEntry[];
}

export type ReportSeverity = 'crash' | 'error' | 'feedback';

export interface BugReport {
  screenshot: string | null;
  annotatedScreenshot: string | null;
  description: string;
  device: DeviceInfo;
  screen: string;
  timestamp: string;
  metadata: Record<string, string>;
  diagnostics?: Diagnostics;
  reproSteps?: string[];
  severity?: ReportSeverity;
}

export interface DeviceInfo {
  model: string;
  os: string;
  appVersion: string;
  screenSize: string;
  locale: string;
  installationId: string;
  expoConfig: { name: string; slug: string } | null;
}

export interface IssueLinkInfo {
  destination: string;
  url: string;
  key: string;
}

export interface SendResult {
  success: boolean;
  error?: string;
  issues?: IssueLinkInfo[];
  reportHash?: string;
}

export interface Integration {
  name: string;
  send(report: BugReport): Promise<SendResult>;
}
