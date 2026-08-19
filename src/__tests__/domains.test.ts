import { describe, it, expect, vi, beforeEach } from 'vitest';

// A resolveTenantId spy shared by the mocked tenant-scoped resource methods, so
// tests can assert that tenant-scoped tools resolve the identifier first.
const resolveTenantId = vi.fn(async (input: unknown) => (typeof input === 'number' ? input : 42));

// Build a fully-mocked InforcerClient. The real SDK resource methods call
// resolveTenantId internally; here we mock at the resource-method level and have
// each tenant-scoped mock call resolveTenantId(input) so the assertion holds.
const mockClient = {
  resolveTenantId,
  tenants: {
    list: vi.fn(async () => [{ clientTenantId: 42, tenantFriendlyName: 'Contoso' }]),
    get: vi.fn(async (input: unknown) => {
      await resolveTenantId(input);
      return { clientTenantId: 42, tenantFriendlyName: 'Contoso' };
    }),
  },
  baselines: {
    list: vi.fn(async (_options?: unknown) => [{ id: 'b1' }]),
  },
  alignment: {
    listScores: vi.fn(async () => [{ tenantId: 42, score: 80 }]),
    getDetails: vi.fn(async (input: unknown) => {
      await resolveTenantId(input);
      return { drift: [] };
    }),
  },
  policies: {
    listByTenant: vi.fn(async (input: unknown) => {
      await resolveTenantId(input);
      return [{ id: 'p1' }];
    }),
  },
  secureScores: {
    getByTenant: vi.fn(async (input: unknown) => {
      await resolveTenantId(input);
      return { currentScore: 55 };
    }),
  },
  users: {
    listByTenant: vi.fn(async (input: unknown, _options?: unknown) => {
      await resolveTenantId(input);
      return { data: [{ id: 'u1' }] };
    }),
    get: vi.fn(async (input: unknown, _userId?: string) => {
      await resolveTenantId(input);
      return { id: 'u1' };
    }),
  },
  groups: {
    listByTenant: vi.fn(async (input: unknown, _options?: unknown) => {
      await resolveTenantId(input);
      return { data: [{ id: 'g1' }] };
    }),
    get: vi.fn(async (input: unknown, _groupId?: string) => {
      await resolveTenantId(input);
      return { id: 'g1' };
    }),
  },
  roles: {
    listByTenant: vi.fn(async (input: unknown) => {
      await resolveTenantId(input);
      return [{ id: 'r1' }];
    }),
  },
  auditEvents: {
    listEventTypes: vi.fn(async () => [{ name: 'login' }]),
    search: vi.fn(async (_options?: unknown) => ({ items: [], continuationToken: undefined })),
  },
  assessments: {
    list: vi.fn(async () => [{ id: 'a1', name: 'CIS' }]),
    run: vi.fn(async (input: unknown, _assessmentId?: string) => {
      await resolveTenantId(input);
      return { runId: 'run-1' };
    }),
  },
  reports: {
    types: vi.fn(async () => [{ key: 'CopilotAdoption', supportedOutputFormats: ['csv'] }]),
    listRuns: vi.fn(async () => [{ runId: 'run-1', status: 'completed' }]),
    run: vi.fn(async (_entries: unknown, tenantIds: unknown[]) => {
      await Promise.all((tenantIds as unknown[]).map((t) => resolveTenantId(t)));
      return { runId: 'run-1' };
    }),
    outputs: vi.fn(async (_runId: string) => ({ isTerminal: true, outputs: [{ id: 'o1' }] })),
    downloadOutput: vi.fn(async (_runId: string, _outputId: string) => ({
      data: new TextEncoder().encode('file-bytes').buffer,
      contentType: 'text/csv',
      fileName: 'report.csv',
    })),
  },
};

vi.mock('../utils/client.js', () => ({
  getClient: () => mockClient,
  getCredentials: () => ({ region: 'us', apiKey: 'k' }),
  resetClient: () => {},
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tenants domain', () => {
  it('lists tenants', async () => {
    const { tenantsHandler } = await import('../domains/tenants.js');
    const res = await tenantsHandler.handleCall('inforcer_tenants_list', {});
    expect(mockClient.tenants.list).toHaveBeenCalled();
    expect(res.isError).toBeFalsy();
  });

  it('gets a tenant (resolves the identifier)', async () => {
    const { tenantsHandler } = await import('../domains/tenants.js');
    await tenantsHandler.handleCall('inforcer_tenants_get', { tenant: 'Contoso' });
    expect(mockClient.tenants.get).toHaveBeenCalledWith('Contoso');
    expect(mockClient.resolveTenantId).toHaveBeenCalledWith('Contoso');
  });

  it('resolves a name to a Client Tenant ID', async () => {
    const { tenantsHandler } = await import('../domains/tenants.js');
    const res = await tenantsHandler.handleCall('inforcer_tenants_resolve', { tenant: 'Contoso' });
    expect(mockClient.resolveTenantId).toHaveBeenCalledWith('Contoso');
    expect(res.content[0].text).toContain('clientTenantId');
  });
});

describe('baselines domain', () => {
  it('lists baselines without filter', async () => {
    const { baselinesHandler } = await import('../domains/baselines.js');
    await baselinesHandler.handleCall('inforcer_baselines_list', {});
    expect(mockClient.baselines.list).toHaveBeenCalledWith({});
  });

  it('passes baseline_tenant_id through', async () => {
    const { baselinesHandler } = await import('../domains/baselines.js');
    await baselinesHandler.handleCall('inforcer_baselines_list', { baseline_tenant_id: 7 });
    expect(mockClient.baselines.list).toHaveBeenCalledWith({ baselineTenantId: 7 });
  });
});

describe('alignment domain', () => {
  it('lists scores', async () => {
    const { alignmentHandler } = await import('../domains/alignment.js');
    await alignmentHandler.handleCall('inforcer_alignment_scores', {});
    expect(mockClient.alignment.listScores).toHaveBeenCalled();
  });

  it('gets details and resolves tenant', async () => {
    const { alignmentHandler } = await import('../domains/alignment.js');
    await alignmentHandler.handleCall('inforcer_alignment_details', { tenant: 'contoso.com' });
    expect(mockClient.alignment.getDetails).toHaveBeenCalledWith('contoso.com');
    expect(mockClient.resolveTenantId).toHaveBeenCalledWith('contoso.com');
  });
});

describe('policies domain', () => {
  it('lists policies and resolves tenant', async () => {
    const { policiesHandler } = await import('../domains/policies.js');
    await policiesHandler.handleCall('inforcer_policies_list', { tenant: 42 as unknown as string });
    expect(mockClient.policies.listByTenant).toHaveBeenCalledWith(42);
    expect(mockClient.resolveTenantId).toHaveBeenCalledWith(42);
  });
});

describe('secure-scores domain', () => {
  it('gets a secure score and resolves tenant', async () => {
    const { secureScoresHandler } = await import('../domains/secure-scores.js');
    await secureScoresHandler.handleCall('inforcer_secure_scores_get', { tenant: 'Contoso' });
    expect(mockClient.secureScores.getByTenant).toHaveBeenCalledWith('Contoso');
    expect(mockClient.resolveTenantId).toHaveBeenCalledWith('Contoso');
  });
});

describe('identity domain', () => {
  it('lists users (resolves tenant)', async () => {
    const { identityHandler } = await import('../domains/identity.js');
    await identityHandler.handleCall('inforcer_users_list', { tenant: 'Contoso' });
    expect(mockClient.users.listByTenant).toHaveBeenCalled();
    expect(mockClient.resolveTenantId).toHaveBeenCalledWith('Contoso');
  });

  it('gets a user', async () => {
    const { identityHandler } = await import('../domains/identity.js');
    await identityHandler.handleCall('inforcer_users_get', { tenant: 'Contoso', user_id: 'u1' });
    expect(mockClient.users.get).toHaveBeenCalledWith('Contoso', 'u1');
  });

  it('lists groups', async () => {
    const { identityHandler } = await import('../domains/identity.js');
    await identityHandler.handleCall('inforcer_groups_list', { tenant: 'Contoso' });
    expect(mockClient.groups.listByTenant).toHaveBeenCalled();
  });

  it('gets a group', async () => {
    const { identityHandler } = await import('../domains/identity.js');
    await identityHandler.handleCall('inforcer_groups_get', { tenant: 'Contoso', group_id: 'g1' });
    expect(mockClient.groups.get).toHaveBeenCalledWith('Contoso', 'g1');
  });

  it('lists roles', async () => {
    const { identityHandler } = await import('../domains/identity.js');
    await identityHandler.handleCall('inforcer_roles_list', { tenant: 'Contoso' });
    expect(mockClient.roles.listByTenant).toHaveBeenCalledWith('Contoso');
    expect(mockClient.resolveTenantId).toHaveBeenCalledWith('Contoso');
  });
});

describe('audit domain', () => {
  it('lists event types', async () => {
    const { auditHandler } = await import('../domains/audit.js');
    await auditHandler.handleCall('inforcer_audit_event_types', {});
    expect(mockClient.auditEvents.listEventTypes).toHaveBeenCalled();
  });

  it('searches the activity log', async () => {
    const { auditHandler } = await import('../domains/audit.js');
    await auditHandler.handleCall('inforcer_audit_search', {
      event_types: ['login'],
      page_size: 10,
    });
    expect(mockClient.auditEvents.search).toHaveBeenCalledWith(
      expect.objectContaining({ eventTypes: ['login'], pageSize: 10 })
    );
  });
});

describe('assessments domain', () => {
  it('lists assessments', async () => {
    const { assessmentsHandler } = await import('../domains/assessments.js');
    await assessmentsHandler.handleCall('inforcer_assessments_list', {});
    expect(mockClient.assessments.list).toHaveBeenCalled();
  });

  it('runs an assessment (resolves tenant) when no elicitation is available', async () => {
    const { assessmentsHandler } = await import('../domains/assessments.js');
    const res = await assessmentsHandler.handleCall('inforcer_assessments_run', {
      tenant: 'Contoso',
      assessment_id: 'a1',
    });
    expect(mockClient.assessments.run).toHaveBeenCalledWith('Contoso', 'a1');
    expect(mockClient.resolveTenantId).toHaveBeenCalledWith('Contoso');
    expect(res.isError).toBeFalsy();
  });

  it('proceeds when elicitation accepts the confirmation', async () => {
    const { assessmentsHandler } = await import('../domains/assessments.js');
    const server = {
      elicitInput: vi.fn(async () => ({ action: 'accept', content: { confirm: true } })),
    };
    const res = await assessmentsHandler.handleCall(
      'inforcer_assessments_run',
      { tenant: 'Contoso', assessment_id: 'a1' },
      { server }
    );
    expect(server.elicitInput).toHaveBeenCalled();
    expect(mockClient.assessments.run).toHaveBeenCalledWith('Contoso', 'a1');
    expect(res.isError).toBeFalsy();
  });

  it('cancels when the user declines the confirmation', async () => {
    const { assessmentsHandler } = await import('../domains/assessments.js');
    const server = {
      elicitInput: vi.fn(async () => ({ action: 'accept', content: { confirm: false } })),
    };
    const res = await assessmentsHandler.handleCall(
      'inforcer_assessments_run',
      { tenant: 'Contoso', assessment_id: 'a1' },
      { server }
    );
    expect(server.elicitInput).toHaveBeenCalled();
    expect(mockClient.assessments.run).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('cancelled');
  });
});

describe('reports domain', () => {
  it('lists the report type catalog', async () => {
    const { reportsHandler } = await import('../domains/reports.js');
    await reportsHandler.handleCall('inforcer_reports_types_list', {});
    expect(mockClient.reports.types).toHaveBeenCalled();
  });

  it('lists report runs', async () => {
    const { reportsHandler } = await import('../domains/reports.js');
    await reportsHandler.handleCall('inforcer_reports_runs_list', {});
    expect(mockClient.reports.listRuns).toHaveBeenCalled();
  });

  it('queues a run (resolves tenants) when no elicitation is available', async () => {
    const { reportsHandler } = await import('../domains/reports.js');
    const res = await reportsHandler.handleCall('inforcer_reports_run', {
      reports: [{ type: 'CopilotAdoption', output_format: 'csv' }],
      tenants: ['Contoso', '139'],
    });
    expect(mockClient.reports.run).toHaveBeenCalledWith(
      [{ type: 'CopilotAdoption', outputFormat: 'csv' }],
      ['Contoso', '139']
    );
    expect(mockClient.resolveTenantId).toHaveBeenCalledWith('Contoso');
    expect(res.isError).toBeFalsy();
  });

  it('proceeds when elicitation accepts the confirmation', async () => {
    const { reportsHandler } = await import('../domains/reports.js');
    const server = {
      elicitInput: vi.fn(async () => ({ action: 'accept', content: { confirm: true } })),
    };
    const res = await reportsHandler.handleCall(
      'inforcer_reports_run',
      { reports: [{ type: 'CopilotAdoption', output_format: 'csv' }], tenants: ['482'] },
      { server }
    );
    expect(server.elicitInput).toHaveBeenCalled();
    expect(mockClient.reports.run).toHaveBeenCalled();
    expect(res.isError).toBeFalsy();
  });

  it('cancels when the user declines the confirmation', async () => {
    const { reportsHandler } = await import('../domains/reports.js');
    const server = {
      elicitInput: vi.fn(async () => ({ action: 'accept', content: { confirm: false } })),
    };
    const res = await reportsHandler.handleCall(
      'inforcer_reports_run',
      { reports: [{ type: 'CopilotAdoption', output_format: 'csv' }], tenants: ['482'] },
      { server }
    );
    expect(server.elicitInput).toHaveBeenCalled();
    expect(mockClient.reports.run).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('cancelled');
  });

  it('polls a run status', async () => {
    const { reportsHandler } = await import('../domains/reports.js');
    const res = await reportsHandler.handleCall('inforcer_reports_run_status', { run_id: 'run-1' });
    expect(mockClient.reports.outputs).toHaveBeenCalledWith('run-1');
    expect(res.isError).toBeFalsy();
  });

  it('downloads an output as base64', async () => {
    const { reportsHandler } = await import('../domains/reports.js');
    const res = await reportsHandler.handleCall('inforcer_reports_download_output', {
      run_id: 'run-1',
      output_id: 'o1',
    });
    expect(mockClient.reports.downloadOutput).toHaveBeenCalledWith('run-1', 'o1');
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.fileName).toBe('report.csv');
    expect(parsed.contentType).toBe('text/csv');
    expect(Buffer.from(parsed.contentBase64, 'base64').toString('utf8')).toBe('file-bytes');
  });
});
