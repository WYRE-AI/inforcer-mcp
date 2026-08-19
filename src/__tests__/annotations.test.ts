import { describe, it, expect } from 'vitest';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { DOMAINS } from '../domains/navigation.js';
import { getDomainHandler } from '../domains/index.js';

async function collectAllDomainTools(): Promise<Tool[]> {
  const tools: Tool[] = [];
  for (const domain of DOMAINS) {
    const handler = await getDomainHandler(domain);
    tools.push(...handler.getTools());
  }
  return tools;
}

const WRITE_TOOLS = ['inforcer_assessments_run', 'inforcer_reports_run'];

describe('tool annotations', () => {
  it('only the known write tools are non-read-only', async () => {
    const tools = await collectAllDomainTools();
    const nonReadOnly = tools.filter(t => t.annotations?.readOnlyHint === false);
    expect(nonReadOnly.map(t => t.name).sort()).toEqual([...WRITE_TOOLS].sort());
  });

  it('every domain tool except the known write tools is marked read-only', async () => {
    const tools = await collectAllDomainTools();
    for (const tool of tools) {
      if (WRITE_TOOLS.includes(tool.name)) continue;
      expect(tool.annotations?.readOnlyHint, `${tool.name} should be read-only`).toBe(true);
    }
  });

  it.each(WRITE_TOOLS)('%s is HIGH-IMPACT and non-destructive', async (toolName) => {
    const tools = await collectAllDomainTools();
    const run = tools.find(t => t.name === toolName);
    expect(run).toBeDefined();
    expect(run?.description).toContain('⚠ HIGH-IMPACT');
    expect(run?.description).toContain('Confirm with the user before invoking.');
    expect(run?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it('no read-only tool carries a warning prefix', async () => {
    const tools = await collectAllDomainTools();
    for (const tool of tools) {
      if (tool.annotations?.readOnlyHint === true) {
        expect(tool.description ?? '').not.toContain('⚠');
      }
    }
  });
});
