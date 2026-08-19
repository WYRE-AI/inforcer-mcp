import type { DomainName, DomainHandler } from '../utils/types.js';

const domainCache = new Map<DomainName, DomainHandler>();

export async function getDomainHandler(domain: DomainName): Promise<DomainHandler> {
  const cached = domainCache.get(domain);
  if (cached) return cached;

  let handler: DomainHandler;
  switch (domain) {
    case 'tenants': {
      const { tenantsHandler } = await import('./tenants.js');
      handler = tenantsHandler;
      break;
    }
    case 'baselines': {
      const { baselinesHandler } = await import('./baselines.js');
      handler = baselinesHandler;
      break;
    }
    case 'alignment': {
      const { alignmentHandler } = await import('./alignment.js');
      handler = alignmentHandler;
      break;
    }
    case 'policies': {
      const { policiesHandler } = await import('./policies.js');
      handler = policiesHandler;
      break;
    }
    case 'secure-scores': {
      const { secureScoresHandler } = await import('./secure-scores.js');
      handler = secureScoresHandler;
      break;
    }
    case 'identity': {
      const { identityHandler } = await import('./identity.js');
      handler = identityHandler;
      break;
    }
    case 'audit': {
      const { auditHandler } = await import('./audit.js');
      handler = auditHandler;
      break;
    }
    case 'assessments': {
      const { assessmentsHandler } = await import('./assessments.js');
      handler = assessmentsHandler;
      break;
    }
    case 'reports': {
      const { reportsHandler } = await import('./reports.js');
      handler = reportsHandler;
      break;
    }
    default:
      throw new Error(`Unknown domain: ${domain}`);
  }

  domainCache.set(domain, handler);
  return handler;
}
