import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { runWithCredentials } from './utils/client.js';
import { logger } from './utils/logger.js';
import { verifyS2sHeader, S2S_HEADER } from './s2s-verify.js';

/**
 * Public example values. A copied placeholder must not verify as a real
 * secret. Matched case-insensitively after trim. Never log the value.
 */
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'replace-with-a-real-secret',
  'your-s2s-secret',
  'your-secret',
  'changeme',
  'change-me',
  'placeholder',
  'secret',
  'example',
  'replace-me',
  's2s-secret',
]);

const LOOPBACK_HOST = '127.0.0.1';

const MISSING_S2S_SECRET_ERROR =
  'Refusing to start HTTP transport: CONDUIT_S2S_SECRET is empty. ' +
  'Set CONDUIT_S2S_SECRET to the gateway-provisioned secret (openssl rand -hex 32), ' +
  'or set MCP_ALLOW_INSECURE_DEV=1 for local development only.';

const PLACEHOLDER_S2S_SECRET_ERROR =
  'Refusing to start HTTP transport: CONDUIT_S2S_SECRET is a known placeholder. ' +
  'Generate a secret with openssl rand -hex 32 and set CONDUIT_S2S_SECRET to that value.';

const INSECURE_DEV_WARNING =
  'SECURITY WARNING: CONDUIT_S2S_SECRET is empty and MCP_ALLOW_INSECURE_DEV=1. ' +
  'HTTP /mcp is not enforcing X-Gateway-S2S and is bound to 127.0.0.1 only. ' +
  'Do not use this outside local development.';

const GATEWAY_CREDENTIALS_UNAUTHORIZED = {
  error: 'Missing credentials',
  message: 'Gateway mode requires X-Inforcer-Region and X-Inforcer-API-Key headers',
  required: ['X-Inforcer-Region', 'X-Inforcer-API-Key'],
};

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[(.+)\]$/, '$1');
  if (normalized === 'localhost' || normalized === '::1') return true;
  const bare = normalized.startsWith('::ffff:')
    ? normalized.slice('::ffff:'.length)
    : normalized;
  const parts = bare.split('.');
  if (parts.length !== 4) return false;
  if (parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
    return false;
  }
  return parts[0] === '127';
}

/**
 * Secret for X-Gateway-S2S on /mcp. Read at HTTP startup, not module load.
 * Empty is fail-closed unless MCP_ALLOW_INSECURE_DEV=1. A known placeholder
 * always refuses to start. The secret value is never written to logs.
 */
function resolveHttpS2sSecret(): { secret: string; insecureDev: boolean } {
  const raw = (process.env.CONDUIT_S2S_SECRET ?? '').trim();
  if (KNOWN_PLACEHOLDER_SECRETS.has(raw.toLowerCase())) {
    logger.error(PLACEHOLDER_S2S_SECRET_ERROR);
    process.exit(1);
  }
  if (raw) return { secret: raw, insecureDev: false };
  if (process.env.MCP_ALLOW_INSECURE_DEV === '1') {
    logger.error(INSECURE_DEV_WARNING);
    return { secret: '', insecureDev: true };
  }
  logger.error(MISSING_S2S_SECRET_ERROR);
  process.exit(1);
}

/**
 * With a real secret, honor MCP_HTTP_HOST (default 127.0.0.1 when unset).
 * Without a secret the insecure-dev bypass forces 127.0.0.1, including when
 * MCP_HTTP_HOST is a wider address such as 0.0.0.0.
 */
function resolveBindHost(hasRealSecret: boolean): string {
  const configured = (process.env.MCP_HTTP_HOST ?? '').trim();
  if (hasRealSecret) return configured || LOOPBACK_HOST;
  if (configured && !isLoopbackHost(configured)) {
    logger.error(
      `WARNING: MCP_HTTP_HOST=${configured} is not a loopback address. ` +
        'MCP_ALLOW_INSECURE_DEV=1 without CONDUIT_S2S_SECRET forces the listener to 127.0.0.1 only.',
    );
  }
  return LOOPBACK_HOST;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * HTTP Streamable transport. Each request gets a fresh Server + Transport
 * (stateless). Refuses to listen unless CONDUIT_S2S_SECRET is a real secret.
 * MCP_ALLOW_INSECURE_DEV=1 is local-only: it logs a warning and binds
 * 127.0.0.1. Gateway mode never falls back to INFORCER_* env credentials.
 * /health stays unauthenticated and does not read credentials.
 */
export async function startHttpTransport(): Promise<HttpServer> {
  const port = parseInt(process.env.MCP_HTTP_PORT || '8080', 10);
  const { secret: s2sSecret, insecureDev } = resolveHttpS2sSecret();
  const host = resolveBindHost(!insecureDev);
  const isGatewayMode = process.env.AUTH_MODE === 'gateway';

  const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health') {
      // Liveness: must not gate on credentials (the ACA probe carries none)
      // and must not read them. Always 200.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        transport: 'http',
        authMode: isGatewayMode ? 'gateway' : 'env',
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', endpoints: ['/mcp', '/health'] }));
      return;
    }

    // Empty s2sSecret is only reachable when MCP_ALLOW_INSECURE_DEV=1.
    // A configured secret is always enforced, before credential extraction.
    const s2sHeader = headerValue(req.headers[S2S_HEADER]);
    if (s2sSecret && !verifyS2sHeader(s2sHeader, s2sSecret)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Missing or invalid X-Gateway-S2S header: this endpoint only accepts requests signed by the gateway.',
      }));
      return;
    }

    const handle = async () => {
      const server = createServer();
      // SECURITY-CRITICAL invariant: this transport MUST stay stateless
      // (sessionIdGenerator: undefined + enableJsonResponse: true). Per-request
      // tenant credentials are carried in an AsyncLocalStorage context opened by
      // runWithCredentials() below. A stateless request->single-response flow
      // keeps the tool call inside that context. Switching to a stateful/SSE
      // transport (sessionIdGenerator set, persistent stream) would let a
      // long-lived connection serve later messages under a stale/foreign
      // credential context — re-review tenant isolation before changing this.
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    };

    if (isGatewayMode) {
      // Credentials must arrive on every request. Falling through would
      // resolve INFORCER_REGION / INFORCER_API_KEY from the process
      // environment, which is not request-scoped.
      const region = headerValue(req.headers['x-inforcer-region']);
      const apiKey = headerValue(req.headers['x-inforcer-api-key']);
      if (!region || !apiKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(GATEWAY_CREDENTIALS_UNAUTHORIZED));
        return;
      }
      await runWithCredentials({ region, apiKey }, handle);
      return;
    }

    await handle();
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      logger.info(`HTTP streaming server listening on ${host}:${port}`);
      logger.info(`Authentication mode: ${isGatewayMode ? 'gateway (header-based)' : 'env (environment variables)'}`);
      resolve();
    });
  });

  return httpServer;
}

async function main(): Promise<void> {
  if (process.env.MCP_TRANSPORT === 'http') {
    const httpServer = await startHttpTransport();
    const shutdown = async () => {
      logger.info('Shutting down...');
      await new Promise<void>((resolve, reject) => {
        httpServer.close(err => (err ? reject(err) : resolve()));
      });
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  await import('./index.js');
}

// Vitest imports this module to call startHttpTransport. Skip the CLI
// entrypoint there. `node dist/http.js` still starts stdio or HTTP.
if (process.env.VITEST !== 'true') {
  main().catch((error) => {
    logger.error('Fatal startup error', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
