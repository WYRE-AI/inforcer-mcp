import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * Ask the user to confirm a HIGH-IMPACT action before it runs.
 *
 * This is purely additive: if the connected client does not support
 * elicitation (or the call throws for any reason), we return `true` so the
 * action proceeds — the tool's description and annotations already tell the
 * caller to confirm with the user first.
 *
 * @returns `false` only when the user explicitly declines; `true` otherwise.
 */
async function confirmHighImpactAction(
  server: Server,
  message: string,
  confirmField: { title: string; description: string }
): Promise<boolean> {
  try {
    const result = await (server as any).elicitInput({
      mode: 'confirm',
      message,
      requestedSchema: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            title: confirmField.title,
            description: confirmField.description,
          },
        },
        required: ['confirm'],
      },
    });

    if (result?.action === 'accept' && result.content) {
      return result.content.confirm === true;
    }
    if (result?.action === 'decline' || result?.action === 'cancel') {
      return false;
    }
  } catch {
    // Elicitation not supported by client — proceed (description instructs
    // the caller to confirm with the user first).
  }

  return true;
}

/** Confirm a HIGH-IMPACT assessment run before it is triggered. */
export async function confirmAssessmentRun(
  server: Server,
  tenant: string,
  assessmentId: string
): Promise<boolean> {
  return confirmHighImpactAction(
    server,
    `Run assessment '${assessmentId}' against tenant '${tenant}'? ` +
      `This triggers a HIGH-IMPACT (non-destructive) assessment run in Inforcer.`,
    { title: 'Confirm assessment run', description: 'Set to true to trigger the assessment run.' }
  );
}

/** Confirm a HIGH-IMPACT report run before it is queued. */
export async function confirmReportRun(
  server: Server,
  reportTypes: string[],
  tenantCount: number
): Promise<boolean> {
  return confirmHighImpactAction(
    server,
    `Queue report(s) [${reportTypes.join(', ')}] across ${tenantCount} tenant(s)? ` +
      `This triggers a HIGH-IMPACT (non-destructive) report run in Inforcer.`,
    { title: 'Confirm report run', description: 'Set to true to queue the report run.' }
  );
}
