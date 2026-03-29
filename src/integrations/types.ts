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

export interface Diagnostics {
  stateSnapshots: StateSnapshot[];
  navHistory: NavEntry[];
  lastError: ErrorInfo | null;
}

export interface BugReport {
  screenshot: string | null;
  annotatedScreenshot: string | null;
  description: string;
  device: DeviceInfo;
  screen: string;
  timestamp: string;
  metadata: Record<string, string>;
  diagnostics?: Diagnostics;
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

export interface SendResult {
  success: boolean;
  error?: string;
}

export interface Integration {
  name: string;
  send(report: BugReport): Promise<SendResult>;
}
