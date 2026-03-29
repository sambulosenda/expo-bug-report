import type { Diagnostics, ReportSeverity } from './integrations/types';

const ERROR_KEYWORDS = /\b(crash(?:ed|ing)?|error(?:ed|s)?|broke|broken)\b/i;

export function detectSeverity(
  diagnostics: Diagnostics | undefined,
  description: string,
): ReportSeverity {
  // Crash: ErrorBoundary caught something
  if (diagnostics?.lastError) {
    return 'crash';
  }

  // Error: user describes an error-like situation
  if (ERROR_KEYWORDS.test(description)) {
    return 'error';
  }

  // Default: general feedback
  return 'feedback';
}
