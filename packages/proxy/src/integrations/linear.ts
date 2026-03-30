import type { IncomingReport, IssueResult } from '../types';

interface LinearConfig {
  token: string;
  team_id: string;
  project_id: string;
}

export async function createLinearIssue(
  report: IncomingReport,
  config: LinearConfig,
  labels: string[],
  screenshotUrl: string | null,
  title?: string,
): Promise<IssueResult> {
  const issueTitle = title ?? (report.description
    ? report.description.slice(0, 200)
    : `Bug report from ${report.screen}`);

  const body = formatIssueBody(report, screenshotUrl);

  // Create issue via Linear GraphQL API
  const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          identifier
          url
        }
      }
    }
  `;

  // First ensure labels exist
  const labelIds = await ensureLabels(config.token, config.team_id, labels);

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: config.token,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        input: {
          teamId: config.team_id,
          projectId: config.project_id || undefined,
          title: issueTitle,
          description: body,
          labelIds: labelIds.length > 0 ? labelIds : undefined,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Linear API returned ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: {
      issueCreate?: {
        success: boolean;
        issue?: { identifier: string; url: string };
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (data.errors?.length) {
    throw new Error(`Linear API error: ${data.errors[0]!.message}`);
  }

  const issue = data.data?.issueCreate?.issue;
  if (!issue) {
    throw new Error('Linear API returned no issue');
  }

  return {
    destination: 'linear',
    url: issue.url,
    key: issue.identifier,
  };
}

export async function addLinearComment(
  issueUrl: string,
  report: IncomingReport,
  config: LinearConfig,
): Promise<void> {
  // Extract issue ID from URL
  const issueId = issueUrl.split('/').pop();
  if (!issueId) return;

  const mutation = `
    mutation CreateComment($input: CommentCreateInput!) {
      commentCreate(input: $input) { success }
    }
  `;

  await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: config.token,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        input: {
          issueId,
          body: `Duplicate report from ${report.screen}\n\n${report.description || 'No description'}`,
        },
      },
    }),
  });
}

async function ensureLabels(
  token: string,
  teamId: string,
  labels: string[],
): Promise<string[]> {
  if (labels.length === 0) return [];

  // Query existing labels
  const query = `
    query TeamLabels($teamId: String!) {
      team(id: $teamId) {
        labels { nodes { id name } }
      }
    }
  `;

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify({ query, variables: { teamId } }),
  });

  if (!response.ok) return [];

  const data = (await response.json()) as {
    data?: { team?: { labels: { nodes: Array<{ id: string; name: string }> } } };
  };

  const existingLabels = data.data?.team?.labels.nodes ?? [];
  const existingMap = new Map(existingLabels.map((l) => [l.name, l.id]));
  const ids: string[] = [];

  for (const label of labels) {
    if (existingMap.has(label)) {
      ids.push(existingMap.get(label)!);
    } else {
      // Create label
      const createMutation = `
        mutation CreateLabel($input: IssueLabelCreateInput!) {
          issueLabelCreate(input: $input) {
            success
            issueLabel { id }
          }
        }
      `;

      const createResponse = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token,
        },
        body: JSON.stringify({
          query: createMutation,
          variables: { input: { teamId, name: label } },
        }),
      });

      if (createResponse.ok) {
        const createData = (await createResponse.json()) as {
          data?: { issueLabelCreate?: { issueLabel?: { id: string } } };
        };
        const newId = createData.data?.issueLabelCreate?.issueLabel?.id;
        if (newId) ids.push(newId);
      }
    }
  }

  return ids;
}

function formatIssueBody(report: IncomingReport, screenshotUrl: string | null): string {
  const sections: string[] = [];

  sections.push(`**Screen:** ${report.screen}`);
  sections.push(`**Device:** ${report.device.model} (${report.device.os})`);
  sections.push(`**App Version:** ${report.device.appVersion}`);
  sections.push(`**Time:** ${report.timestamp}`);

  if (report.description) {
    sections.push(`\n**Description:**\n${report.description}`);
  }

  if (screenshotUrl) {
    sections.push(`\n**Screenshot:**\n![Screenshot](${screenshotUrl})`);
  }

  if (report.diagnostics) {
    const d = report.diagnostics;

    if (d.navHistory.length > 0) {
      const route = d.navHistory.map((e) => e.pathname).join(' → ');
      sections.push(`\n**Navigation:** ${route}`);
    }

    if (d.lastError) {
      sections.push(`\n**Error:** \`${d.lastError.message}\``);
      if (d.lastError.stack) {
        const firstLines = d.lastError.stack.split('\n').slice(0, 3).join('\n');
        sections.push(`\`\`\`\n${firstLines}\n\`\`\``);
      }
    }

    if (d.stateSnapshots.length > 0) {
      sections.push(`\n**State Snapshots:** ${d.stateSnapshots.length} captured`);
      for (const snap of d.stateSnapshots.slice(-3)) {
        const preview = snap.state.length > 200 ? snap.state.slice(0, 200) + '...' : snap.state;
        sections.push(`- _${snap.name}:_ \`${preview}\``);
      }
    }
  }

  const meta = Object.entries(report.metadata);
  if (meta.length > 0) {
    sections.push(`\n**Metadata:** ${meta.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  return sections.join('\n');
}
