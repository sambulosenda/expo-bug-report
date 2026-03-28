export interface BugReport {
  screenshot: string | null;
  annotatedScreenshot: string | null;
  description: string;
  device: DeviceInfo;
  screen: string;
  timestamp: string;
  metadata: Record<string, string>;
}

export interface DeviceInfo {
  model: string;
  os: string;
  appVersion: string;
  screenSize: string;
  locale: string;
}

export interface SendResult {
  success: boolean;
  error?: string;
}

export interface Integration {
  name: string;
  send(report: BugReport): Promise<SendResult>;
}
