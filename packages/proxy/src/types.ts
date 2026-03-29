export interface Env {
  DB: D1Database;
  SCREENSHOTS: R2Bucket;
  FANOUT_QUEUE: Queue;
  ENCRYPTION_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

export interface User {
  id: string;
  email: string;
  api_key: string;
  hmac_secret: string;
  stripe_customer_id: string | null;
  plan: 'free' | 'starter' | 'pro' | 'beta';
  created_at: string;
}

export interface IntegrationRow {
  id: string;
  user_id: string;
  type: 'linear' | 'github' | 'jira' | 'slack_webhook' | 'webhook';
  config: string; // encrypted JSON
  enabled: number;
  created_at: string;
}

export interface RoutingRule {
  id: string;
  user_id: string;
  integration_id: string;
  conditions: string | null; // JSON or null (always fire)
  created_at: string;
}

export interface RoutingConditions {
  screen_match?: string | null;
  error_type?: 'crash' | 'visual' | 'functional' | null;
  platform?: 'ios' | 'android' | null;
}

export interface QueueMessage {
  report: IncomingReport;
  integration: {
    id: string;
    type: IntegrationRow['type'];
  };
  labels: string[];
  screenshotUrl: string | null;
  userId: string;
}

export interface IncomingReport {
  screenshot: string | null;
  annotatedScreenshot: string | null;
  screenshotBase64: string | null;
  description: string;
  device: {
    model: string;
    os: string;
    appVersion: string;
    screenSize: string;
    locale: string;
    installationId: string;
    expoConfig: { name: string; slug: string } | null;
  };
  screen: string;
  timestamp: string;
  metadata: Record<string, string>;
  diagnostics?: {
    stateSnapshots: Array<{ name: string; state: string; timestamp: string; truncated: boolean }>;
    navHistory: Array<{ pathname: string; segments: string[]; timestamp: string }>;
    lastError: { message: string; stack: string | null; componentStack: string | null; timestamp: string } | null;
  };
}

export interface IssueResult {
  destination: string;
  url: string;
  key: string;
}
