import type { IncomingReport, IssueResult } from '../types';

interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
}

export async function createGithubIssue(
  report: IncomingReport,
  config: GithubConfig,
  labels: string[],
  screenshotUrl: string | null,
  title?: string,
): Promise<IssueResult> {
  const issueTitle = title ?? (report.description
    ? report.description.slice(0, 200)
    : `Bug report from ${report.screen}`);

  const body = formatIssueBody(report, screenshotUrl);

  // Ensure labels exist first
  await ensureLabels(config, labels);

  const response = await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/issues`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
        'User-Agent': 'BugPulse-Proxy/1.0',
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        title: issueTitle,
        body,
        labels: labels.length > 0 ? labels : undefined,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }

  const data = (await response.json()) as {
    number: number;
    html_url: string;
  };

  return {
    destination: 'github',
    url: data.html_url,
    key: `#${data.number}`,
  };
}

export async function addGithubComment(
  issueUrl: string,
  report: IncomingReport,
  config: GithubConfig,
): Promise<void> {
  // Extract issue number from URL
  const match = issueUrl.match(/\/issues\/(\d+)/);
  if (!match) return;

  const issueNumber = match[1];
  await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${issueNumber}/comments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
        'User-Agent': 'BugPulse-Proxy/1.0',
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        body: `Duplicate report from \`${report.screen}\`\n\n${report.description || 'No description'}`,
      }),
    },
  );
}

async function ensureLabels(config: GithubConfig, labels: string[]): Promise<void> {
  for (const label of labels) {
    try {
      await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/labels`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.token}`,
            'User-Agent': 'BugPulse-Proxy/1.0',
            Accept: 'application/vnd.github+json',
          },
          body: JSON.stringify({
            name: label,
            color: '6B7280',
            description: 'Auto-created by BugPulse',
          }),
        },
      );
    } catch {
      // Label may already exist — ignore 422
    }
  }
}

function formatIssueBody(report: IncomingReport, screenshotUrl: string | null): string {
  const sections: string[] = [];

  sections.push('## Bug Report');
  sections.push(`| Field | Value |`);
  sections.push(`|-------|-------|`);
  sections.push(`| Screen | \`${report.screen}\` |`);
  sections.push(`| Device | ${report.device.model} |`);
  sections.push(`| OS | ${report.device.os} |`);
  sections.push(`| App Version | ${report.device.appVersion} |`);
  sections.push(`| Time | ${report.timestamp} |`);

  if (report.description) {
    sections.push(`\n### Description\n${report.description}`);
  }

  if (screenshotUrl) {
    sections.push(`\n### Screenshot\n![Screenshot](${screenshotUrl})`);
  }

  if (report.diagnostics) {
    const d = report.diagnostics;

    if (d.navHistory.length > 0) {
      sections.push('\n### Navigation History');
      sections.push(d.navHistory.map((e) => `- \`${e.pathname}\` (${e.timestamp})`).join('\n'));
    }

    if (d.lastError) {
      sections.push('\n### Error');
      sections.push(`\`\`\`\n${d.lastError.message}\n${d.lastError.stack ?? ''}\n\`\`\``);
    }

    if (d.stateSnapshots.length > 0) {
      sections.push(`\n### State (${d.stateSnapshots.length} snapshots)`);
      for (const snap of d.stateSnapshots.slice(-3)) {
        const preview = snap.state.length > 300 ? snap.state.slice(0, 300) + '...' : snap.state;
        sections.push(`<details><summary>${snap.name}</summary>\n\n\`\`\`json\n${preview}\n\`\`\`\n</details>`);
      }
    }
  }

  sections.push('\n---\n_Filed by [BugPulse](https://bugpulse.dev)_');
  return sections.join('\n');
}
