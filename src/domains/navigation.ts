import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainName } from '../utils/types.js';

export const DOMAINS: DomainName[] = [
  'tenants',
  'baselines',
  'alignment',
  'policies',
  'secure-scores',
  'identity',
  'audit',
  'assessments',
  'reports',
];

export function getNavigationTools(): Tool[] {
  return [
    {
      name: 'inforcer_navigate',
      description: `Discover available Inforcer tools by domain. Returns tool names and descriptions for the selected domain. All tools are callable at any time — this is a help/discovery aid, not a prerequisite.`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          domain: {
            type: 'string',
            enum: DOMAINS,
            description: `The domain to explore:
- tenants: list/get tenants, resolve a name/DNS/GUID to a Client Tenant ID
- baselines: list baseline groups
- alignment: alignment scores and per-tenant drift details
- policies: list policies for a tenant
- secure-scores: Microsoft Secure Score for a tenant
- identity: Entra ID users, groups, and directory roles for a tenant
- audit: audit event types and activity-log search
- assessments: list assessments and trigger an assessment run (write)
- reports: list report types and runs, queue a report run and poll it to completion, download a finished output (write)`,
          },
        },
        required: ['domain'],
      },
    },
    {
      name: 'inforcer_status',
      description:
        'Check Inforcer API connectivity and available domains. Performs a live baselines.list() call as a read-only connectivity check.',
      inputSchema: { type: 'object' as const, properties: {} },
    },
  ];
}
