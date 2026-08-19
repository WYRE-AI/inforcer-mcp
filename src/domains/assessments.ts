import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient } from '../utils/client.js';
import { confirmAssessmentRun } from '../elicitation/forms.js';
import { logger } from '../utils/logger.js';

const TENANT_ARG_DESC =
  'Tenant identifier — accepts a numeric Client Tenant ID, a tenant DNS name, ' +
  'an Azure AD tenant GUID, or a friendly name. Resolved to the numeric Client ' +
  'Tenant ID before the request.';

function getTools(): Tool[] {
  return [
    {
      name: 'inforcer_assessments_list',
      description: 'List the assessments available to run (use to discover assessment IDs). Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: {} },
    },
    {
      name: 'inforcer_assessments_run',
      description:
        '⚠ HIGH-IMPACT. Triggers an assessment run for a tenant. This is not destructive, but it ' +
        'kicks off real work in Inforcer and is visible to operators. ' +
        `${TENANT_ARG_DESC} Confirm with the user before invoking.`,
      annotations: {
        title: 'Run assessment (high-impact)',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object' as const,
        properties: {
          tenant: { type: 'string', description: TENANT_ARG_DESC },
          assessment_id: {
            type: 'string',
            description: 'The assessment ID to run (discover IDs via inforcer_assessments_list)',
          },
        },
        required: ['tenant', 'assessment_id'],
      },
    },
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>,
  extra?: unknown
): Promise<CallToolResult> {
  const client = getClient();

  switch (toolName) {
    case 'inforcer_assessments_list': {
      logger.info('API call: assessments.list');
      const result = await client.assessments.list();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    case 'inforcer_assessments_run': {
      const tenant = args.tenant as string;
      const assessmentId = args.assessment_id as string;

      // Additive confirmation — never blocks when elicitation is unsupported.
      const server = (extra as { server?: Server } | undefined)?.server;
      if (server) {
        const confirmed = await confirmAssessmentRun(server, tenant, assessmentId);
        if (!confirmed) {
          return {
            content: [{ type: 'text', text: 'Assessment run cancelled by user.' }],
            isError: true,
          };
        }
      }

      logger.info('API call: assessments.run', { tenant, assessmentId });
      const result = await client.assessments.run(tenant, assessmentId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
  }
}

export const assessmentsHandler: DomainHandler = { getTools, handleCall };
