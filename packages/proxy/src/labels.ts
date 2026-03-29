import type { IncomingReport } from './types';

export function deriveLabels(report: IncomingReport): string[] {
  const labels: string[] = [];

  // Platform label from OS string
  const os = report.device.os.toLowerCase();
  if (os.includes('ios')) {
    labels.push('platform:ios');
  } else if (os.includes('android')) {
    labels.push('platform:android');
  }

  // Screen label
  if (report.screen && report.screen !== 'unknown') {
    labels.push(`screen:${report.screen}`);
  }

  // Error labels
  if (report.diagnostics?.lastError) {
    labels.push('has-error');
    const msg = report.diagnostics.lastError.message;
    const errorType = extractErrorType(msg);
    if (errorType) {
      labels.push(`error:${errorType}`);
    }
  }

  return labels;
}

function extractErrorType(message: string): string | null {
  const patterns = [
    'TypeError',
    'ReferenceError',
    'SyntaxError',
    'RangeError',
    'NetworkError',
    'TimeoutError',
  ];

  for (const pattern of patterns) {
    if (message.includes(pattern)) {
      return pattern;
    }
  }

  return null;
}
