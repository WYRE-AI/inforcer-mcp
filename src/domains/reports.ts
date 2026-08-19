import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { getClient } from '../utils/client.js';
import { confirmReportRun } from '../elicitation/forms.js';
import { logger } from '../utils/logger.js';

const TENANTS_ARG_DESC =
  'Tenant identifiers to run the report(s) against — each accepts a numeric Client Tenant ID, ' +
  'a tenant DNS name, an Azure AD tenant GUID, or a friendly name. Resolved to numeric Client ' +
  'Tenant IDs before the request.';

function getTools(): Tool[] {
  return [
    {
      name: 'inforcer_reports_types_list',
      description:
        'List the catalog of available report types — key, supported output formats, whether ' +
        'the type is collatable (single cross-tenant output), and accepted parameters. Use to ' +
        'discover valid (type, output_format) pairs before calling inforcer_reports_run. Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: {} },
    },
    {
      name: 'inforcer_reports_runs_list',
      description: 'List queued and completed report runs. Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: { type: 'object' as const, properties: {} },
    },
    {
      name: 'inforcer_reports_run',
      description:
        '⚠ HIGH-IMPACT. Queues one or more reports across one or more tenants. This is not ' +
        'destructive, but it kicks off real report-generation work in Inforcer. Reports run ' +
        'asynchronously — use inforcer_reports_run_status to poll the returned run(s) to ' +
        'completion, then inforcer_reports_download_output to fetch each finished output. ' +
        'Confirm with the user before invoking.',
      annotations: {
        title: 'Queue report run (high-impact)',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object' as const,
        properties: {
          reports: {
            type: 'array',
            description:
              'One or more reports to queue. Discover valid type/output_format pairs via ' +
              'inforcer_reports_types_list.',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  description: 'Report type key (e.g. CopilotAdoption, TenantAuditReport, Assessment).',
                },
                output_format: {
                  type: 'string',
                  description: "Output format (e.g. csv, pdf, html, xlsx, json) — must be one of the type's supported formats.",
                },
                collate: {
                  type: 'boolean',
                  description: 'Request a single cross-tenant output instead of one per tenant. Only valid when the type is collatable.',
                },
                parameters: {
                  type: 'object',
                  description:
                    'Additional report parameters as string key/value pairs, e.g. {"report-period": "30"} ' +
                    'or {"assessment-id": "..."} (required for the Assessment report type).',
                  additionalProperties: { type: 'string' },
                },
              },
              required: ['type', 'output_format'],
            },
          },
          tenants: {
            type: 'array',
            description: TENANTS_ARG_DESC,
            minItems: 1,
            items: { type: 'string' },
          },
        },
        required: ['reports', 'tenants'],
      },
    },
    {
      name: 'inforcer_reports_run_status',
      description:
        'Poll a report run. Returns isTerminal:false with no outputs while the run is still in ' +
        'progress, or isTerminal:true with the list of downloadable outputs once it finishes. ' +
        'Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        type: 'object' as const,
        properties: {
          run_id: {
            type: 'string',
            description: 'The run identifier returned by inforcer_reports_run.',
          },
        },
        required: ['run_id'],
      },
    },
    {
      name: 'inforcer_reports_download_output',
      description:
        'Download a single finished report output (discovered via inforcer_reports_run_status). ' +
        'Returns the file content base64-encoded along with its filename and content type. Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        type: 'object' as const,
        properties: {
          run_id: {
            type: 'string',
            description: 'The run identifier the output belongs to.',
          },
          output_id: {
            type: 'string',
            description: "The output's id, from inforcer_reports_run_status's outputs list.",
          },
        },
        required: ['run_id', 'output_id'],
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
    case 'inforcer_reports_types_list': {
      logger.info('API call: reports.types');
      const result = await client.reports.types();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    case 'inforcer_reports_runs_list': {
      logger.info('API call: reports.listRuns');
      const result = await client.reports.listRuns();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    case 'inforcer_reports_run': {
      const reports = args.reports as Array<{
        type: string;
        output_format: string;
        collate?: boolean;
        parameters?: Record<string, string>;
      }>;
      const tenants = args.tenants as string[];

      const entries = reports.map((r) => ({
        type: r.type,
        outputFormat: r.output_format,
        collate: r.collate,
        parameters: r.parameters,
      }));

      // Additive confirmation — never blocks when elicitation is unsupported.
      const server = (extra as { server?: Server } | undefined)?.server;
      if (server) {
        const confirmed = await confirmReportRun(
          server,
          entries.map((e) => e.type),
          tenants.length
        );
        if (!confirmed) {
          return {
            content: [{ type: 'text', text: 'Report run cancelled by user.' }],
            isError: true,
          };
        }
      }

      logger.info('API call: reports.run', { reports: entries, tenants });
      const result = await client.reports.run(entries, tenants);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    case 'inforcer_reports_run_status': {
      const runId = args.run_id as string;
      logger.info('API call: reports.outputs', { runId });
      const result = await client.reports.outputs(runId);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    case 'inforcer_reports_download_output': {
      const runId = args.run_id as string;
      const outputId = args.output_id as string;
      logger.info('API call: reports.downloadOutput', { runId, outputId });
      const result = await client.reports.downloadOutput(runId, outputId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                runId,
                outputId,
                fileName: result.fileName,
                contentType: result.contentType,
                sizeBytes: result.data.byteLength,
                contentBase64: Buffer.from(result.data).toString('base64'),
              },
              null,
              2
            ),
          },
        ],
      };
    }
    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
  }
}

export const reportsHandler: DomainHandler = { getTools, handleCall };
