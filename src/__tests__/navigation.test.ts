import { describe, it, expect } from 'vitest';
import { getNavigationTools, DOMAINS } from '../domains/navigation.js';

describe('Navigation', () => {
  it('should have all domains', () => {
    expect(DOMAINS).toContain('tenants');
    expect(DOMAINS).toContain('baselines');
    expect(DOMAINS).toContain('alignment');
    expect(DOMAINS).toContain('policies');
    expect(DOMAINS).toContain('secure-scores');
    expect(DOMAINS).toContain('identity');
    expect(DOMAINS).toContain('audit');
    expect(DOMAINS).toContain('assessments');
    expect(DOMAINS).toContain('reports');
  });

  it('should expose exactly nine domains', () => {
    expect(DOMAINS).toHaveLength(9);
  });

  it('should return navigation tools', () => {
    const tools = getNavigationTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('inforcer_navigate');
    expect(tools[1].name).toBe('inforcer_status');
  });

  it('should have stateless navigate tool description', () => {
    const tools = getNavigationTools();
    const navigateTool = tools.find(t => t.name === 'inforcer_navigate');
    expect(navigateTool?.description).toContain('All tools are callable at any time');
  });

  it('navigate enum should match the DOMAINS list (state machine)', () => {
    const tools = getNavigationTools();
    const navigateTool = tools.find(t => t.name === 'inforcer_navigate');
    const props = navigateTool?.inputSchema?.properties as
      | { domain?: { enum?: string[] } }
      | undefined;
    expect(props?.domain?.enum).toEqual(DOMAINS);
  });
});
