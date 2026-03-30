import type { IncomingReport, IssueResult } from '../types';

interface JiraConfig {
  email: string;
  api_token: string;
  domain: string;
  project_key: string;
}

export async function createJiraIssue(
  report: IncomingReport,
  config: JiraConfig,
  labels: string[],
  screenshotUrl: string | null,
  title?: string,
): Promise<IssueResult> {
  const summary = title ?? (report.description
    ? report.description.slice(0, 250)
    : `Bug report from ${report.screen}`);

  const description = formatJiraDescription(report, screenshotUrl);

  // Basic Auth: base64(email:api_token)
  const auth = btoa(`${config.email}:${config.api_token}`);

  // Sanitize labels for Jira (no spaces, no special chars)
  const jiraLabels = labels.map((l) => l.replace(/[^a-zA-Z0-9:_-]/g, '_'));

  const response = await fetch(
    `https://${config.domain}/rest/api/3/issue`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        fields: {
          project: { key: config.project_key },
          summary,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: description }],
              },
            ],
          },
          issuetype: { name: 'Bug' },
          labels: jiraLabels.length > 0 ? jiraLabels : undefined,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Jira API returned ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    key: string;
    self: string;
  };

  return {
    destination: 'jira',
    url: `https://${config.domain}/browse/${data.key}`,
    key: data.key,
  };
}

export async function addJiraComment(
  issueUrl: string,
  report: IncomingReport,
  config: JiraConfig,
): Promise<void> {
  // Extract issue key from URL (e.g., https://domain/browse/PROJ-123)
  const match = issueUrl.match(/\/browse\/([A-Z]+-\d+)/);
  if (!match) return;

  const issueKey = match[1];
  const auth = btoa(`${config.email}:${config.api_token}`);

  await fetch(
    `https://${config.domain}/rest/api/3/issue/${issueKey}/comment`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `Duplicate report from ${report.screen}\n\n${report.description || 'No description'}`,
                },
              ],
            },
          ],
        },
      }),
    },
  );
}

function formatJiraDescription(report: IncomingReport, screenshotUrl: string | null): string {
  const lines: string[] = [];

  lines.push(`Screen: ${report.screen}`);
  lines.push(`Device: ${report.device.model} (${report.device.os})`);
  lines.push(`App Version: ${report.device.appVersion}`);
  lines.push(`Time: ${report.timestamp}`);

  if (report.description) {
    lines.push(`\nDescription:\n${report.description}`);
  }

  if (screenshotUrl) {
    lines.push(`\nScreenshot: ${screenshotUrl}`);
  }

  if (report.diagnostics) {
    const d = report.diagnostics;

    if (d.navHistory.length > 0) {
      lines.push(`\nNavigation: ${d.navHistory.map((e) => e.pathname).join(' → ')}`);
    }

    if (d.lastError) {
      lines.push(`\nError: ${d.lastError.message}`);
    }

    if (d.stateSnapshots.length > 0) {
      lines.push(`\nState snapshots: ${d.stateSnapshots.length} captured`);
    }
  }

  return lines.join('\n');
}
