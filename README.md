# Inforcer MCP Server

[![Build Status](https://github.com/WYRE-AI/inforcer-mcp/actions/workflows/release.yml/badge.svg)](https://github.com/WYRE-AI/inforcer-mcp/actions/workflows/release.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives AI assistants structured, **mostly read-only** access to [Inforcer](https://www.inforcer.com) Microsoft 365 baseline-governance data — tenants, baselines, alignment/drift, policies, secure scores, identity, audit logs, and report generation — plus two write actions to trigger an assessment run or queue a report.

> **Note:** This project is maintained by [Wyre Technology](https://github.com/WYRE-AI).

## ⚠ Community-sourced API

Inforcer does not (at time of writing) publish an official REST API specification. This server wraps the [`@wyre-technology/node-inforcer`](https://github.com/WYRE-AI/node-inforcer) SDK, whose API surface is **community-sourced** from [royklo/InforcerCommunity](https://github.com/royklo/InforcerCommunity). Endpoints, field shapes, and behavior may change without notice. Treat results accordingly and verify anything load-bearing against the Inforcer portal.

## Read-only scope

Every tool in this server is **read-only** EXCEPT two:

- `inforcer_assessments_run` — triggers an assessment run for a tenant.
- `inforcer_reports_run` — queues one or more report runs across one or more tenants.

Both are **HIGH-IMPACT** (not destructive): they kick off real work in Inforcer and are visible to operators. Both are annotated accordingly and ask for confirmation before running. **Confirm with the user before invoking.**

There are **no** create/update/delete tools for policies, tenants, or baselines — those operations are not exposed by the community API and are intentionally absent here.

## Quick Start

**Claude Code (CLI):**

```bash
claude mcp add inforcer-mcp \
  -e INFORCER_REGION=us \
  -e INFORCER_API_KEY=your-api-key \
  -- npx -y github:WYRE-AI/inforcer-mcp
```

See [Installation](#installation) for Docker and from-source methods.

## Features

- **🔌 MCP Protocol Compliance**: Full support for MCP tools and prompts
- **🛡️ Governance Coverage (read-only)**: Tenants, baselines, alignment/drift, policies, Microsoft Secure Score, Entra ID identity, and the audit log
- **🔍 Decision-Tree Navigation**: Start with `inforcer_navigate` to explore domains, then call domain-specific tools
- **🧭 Flexible Tenant Resolution**: Most tools accept a `tenant` as a numeric Client Tenant ID, a tenant DNS name, an Azure AD GUID, or a friendly name — resolved automatically
- **🔒 Secure Authentication**: `Inf-Api-Key` header auth, region-scoped
- **🌐 Dual Transport**: stdio (local) and HTTP Streamable (gateway/Docker)
- **🐳 Docker Ready**: Containerized deployment with HTTP transport and health checks
- **📊 Structured Logging**: Configurable levels, credentials never logged

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Tenant identifiers](#tenant-identifiers)
- [Domains and tools](#domains-and-tools)
- [Gateway connection](#gateway-connection)
- [Docker Deployment](#docker-deployment)
- [Development](#development)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Installation

### Option 1: Claude Code (CLI)

```bash
claude mcp add inforcer-mcp \
  -e INFORCER_REGION=us \
  -e INFORCER_API_KEY=your-api-key \
  -- npx -y github:WYRE-AI/inforcer-mcp
```

### Option 2: Docker

The image listens on `0.0.0.0` inside the container and defaults to `AUTH_MODE=gateway`. Publish the port on loopback and pass a real S2S secret. In gateway mode the Inforcer region and API key arrive on each request as headers; they are not read from the environment.

```bash
docker build -t inforcer-mcp .
docker run \
  -e CONDUIT_S2S_SECRET \
  -p 127.0.0.1:8080:8080 \
  inforcer-mcp
```

Or pull the pre-built image:

```bash
docker run -d \
  -e CONDUIT_S2S_SECRET \
  -p 127.0.0.1:8080:8080 \
  ghcr.io/wyre-ai/inforcer-mcp:latest
```

Compose refuses to start when `CONDUIT_S2S_SECRET` is unset:

```bash
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" docker compose up
```

### Option 3: From Source

```bash
git clone https://github.com/WYRE-AI/inforcer-mcp.git
cd inforcer-mcp
export NODE_AUTH_TOKEN=$(gh auth token)   # to install @wyre-ai/* from GitHub Packages
npm ci
npm run build
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `INFORCER_REGION` | For stdio and `AUTH_MODE=env` | Inforcer API region — one of `anz`, `eu`, `uk`, `us`. There is no default. The Compose gateway service does not load this variable. |
| `INFORCER_API_KEY` | For stdio and `AUTH_MODE=env` | Inforcer API key, sent as the `Inf-Api-Key` header. The Compose gateway service does not load this variable. |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http` |
| `AUTH_MODE` | No | `gateway` (Docker image and Compose default) or `env`. Gateway mode requires `X-Inforcer-Region` and `X-Inforcer-API-Key` on each `/mcp` request and never falls back to `INFORCER_*`. `env` uses those variables only after S2S auth succeeds. |
| `CONDUIT_S2S_SECRET` | Yes for HTTP | Service-to-service secret. Generate with `openssl rand -hex 32`. The HTTP server logs an error and exits non-zero when this is empty or a known placeholder (`changeme`, `your-s2s-secret`, `secret`, `placeholder`, and similar public examples). Compose will not start without it. Never commit a real value. The value is never logged. |
| `MCP_ALLOW_INSECURE_DEV` | No | Set to exactly `1` only for local development to start HTTP without `CONDUIT_S2S_SECRET`. The process logs a warning, does not enforce `X-Gateway-S2S`, and forces the listener onto `127.0.0.1` even if `MCP_HTTP_HOST` is a wider address. A known placeholder secret is still refused. |
| `MCP_HTTP_HOST` | No | Bind address when `MCP_TRANSPORT=http`. Defaults to `127.0.0.1` when unset. A configured `CONDUIT_S2S_SECRET` honors this value. The container image sets `0.0.0.0`. |
| `MCP_HTTP_PORT` | No | HTTP port. Defaults to `8080`. |
| `LOG_LEVEL` | No | Log level (`debug`, `info`, `warn`, `error`). Defaults to `info`. |

`/health` stays unauthenticated and does not read credentials. The stdio transport does not use `CONDUIT_S2S_SECRET`.

Both `INFORCER_REGION` and `INFORCER_API_KEY` are required for any API call in stdio and `AUTH_MODE=env`. Tool discovery (`tools/list`) works without them; the first real call will error if either is missing.

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`. The check is `verifyS2sHeader` in [`src/s2s-verify.ts`](src/s2s-verify.ts): the header value is `t=<unix seconds>,v1=<hex>`, where the hex is HMAC-SHA256 of the literal string `t=<unix seconds>` keyed with `CONDUIT_S2S_SECRET` (64 lowercase hex characters). The timestamp must be within 300 seconds of the server clock. A missing or invalid header returns HTTP 401 before vendor credentials are read.

```bash
TS=$(date +%s)
SIG=$(printf 't=%s' "$TS" | openssl dgst -sha256 -hmac "$CONDUIT_S2S_SECRET" -hex | awk '{print $NF}')
curl -sS http://127.0.0.1:8080/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "X-Gateway-S2S: t=${TS},v1=${SIG}" \
  -H 'X-Inforcer-Region: us' \
  -H "X-Inforcer-API-Key: $INFORCER_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

In `AUTH_MODE=gateway`, `/mcp` also requires `X-Inforcer-Region` and `X-Inforcer-API-Key`. Those headers are the only credential source for the request. With `AUTH_MODE=env`, the signed request uses `INFORCER_REGION` and `INFORCER_API_KEY` from the environment.

## Tenant identifiers

Inforcer's tenant-scoped routes use an integer **Client Tenant ID** — which is **NOT** the same as the Azure AD tenant GUID (`msTenantId`). To make tools easy to use, the `tenant` argument accepts any of:

- a numeric **Client Tenant ID** (e.g. `42`),
- a **tenant DNS name** (e.g. `contoso.onmicrosoft.com`),
- an **Azure AD tenant GUID** (`msTenantId`), or
- a **friendly name** (e.g. `Contoso`).

Names/DNS/GUIDs are resolved to the numeric Client Tenant ID via the SDK's `resolveTenantId` before each tenant-scoped call. If a name matches more than one tenant, the call fails with a clear "ambiguous" error — pass the numeric Client Tenant ID instead. Use `inforcer_tenants_resolve` to see exactly which Client Tenant ID an input maps to.

## Domains and tools

The server uses decision-tree navigation. Start with `inforcer_navigate` to pick a domain, or call any tool directly. All tools are read-only except `inforcer_assessments_run` and `inforcer_reports_run`.

| Domain | Tools | Read-only |
|--------|-------|-----------|
| **navigation** | `inforcer_navigate`, `inforcer_status` (live `baselines.list()` connectivity check) | ✅ |
| **tenants** | `inforcer_tenants_list`, `inforcer_tenants_get`, `inforcer_tenants_resolve` | ✅ |
| **baselines** | `inforcer_baselines_list` | ✅ |
| **alignment** | `inforcer_alignment_scores`, `inforcer_alignment_details` (per-tenant drift) | ✅ |
| **policies** | `inforcer_policies_list` (by tenant) | ✅ |
| **secure-scores** | `inforcer_secure_scores_get` (by tenant) | ✅ |
| **identity** | `inforcer_users_list`, `inforcer_users_get`, `inforcer_groups_list`, `inforcer_groups_get`, `inforcer_roles_list` | ✅ |
| **audit** | `inforcer_audit_event_types`, `inforcer_audit_search` | ✅ |
| **assessments** | `inforcer_assessments_list` (✅), `inforcer_assessments_run` (⚠ HIGH-IMPACT, **not** read-only) | mixed |
| **reports** | `inforcer_reports_types_list`, `inforcer_reports_runs_list`, `inforcer_reports_run_status`, `inforcer_reports_download_output` (✅), `inforcer_reports_run` (⚠ HIGH-IMPACT, **not** read-only) | mixed |

`inforcer_reports_run` queues asynchronously — poll the run with `inforcer_reports_run_status` until `isTerminal: true`, then fetch each output with `inforcer_reports_download_output` (returns base64-encoded file content).

## Gateway connection

When hosted behind the WYRE MCP Gateway, set `AUTH_MODE=gateway` and `MCP_TRANSPORT=http`. In this mode the server is stateless (a fresh MCP server + transport per request) and reads credentials from per-request HTTP headers injected by the gateway. A request missing either header gets HTTP 401 and does not fall back to `INFORCER_REGION` or `INFORCER_API_KEY`.

| Header | Maps to |
|--------|---------|
| `X-Gateway-S2S` | HMAC proof described under [HTTP authentication](#http-authentication). Required on every `/mcp` request when `CONDUIT_S2S_SECRET` is set. |
| `X-Inforcer-Region` | `INFORCER_REGION` |
| `X-Inforcer-API-Key` | `INFORCER_API_KEY` |

The container image defaults to `MCP_TRANSPORT=http` and `AUTH_MODE=gateway`. `/health` always returns 200, does not require authentication, and does not read vendor credentials.

## Docker Deployment

See [docker-compose.yml](docker-compose.yml). The checked-in Compose service is gateway mode. It publishes `127.0.0.1:8080:8080`, requires `CONDUIT_S2S_SECRET`, and does not set `INFORCER_REGION`, `INFORCER_API_KEY`, or `env_file`.

```bash
cp .env.example .env
# Set CONDUIT_S2S_SECRET in .env (openssl rand -hex 32). Leave INFORCER_* empty
# for the gateway service; those credentials arrive as request headers.
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" docker compose up -d
```

Single-tenant HTTP (`AUTH_MODE=env`) still requires the S2S secret, then uses `INFORCER_REGION` and `INFORCER_API_KEY`. It is separate from the gateway Compose service:

```bash
docker run \
  -e CONDUIT_S2S_SECRET \
  -e AUTH_MODE=env \
  -e INFORCER_REGION=us \
  -e INFORCER_API_KEY=your-key \
  -p 127.0.0.1:8080:8080 \
  inforcer-mcp
```

Local HTTP without a secret is development-only. It binds `127.0.0.1` only and logs a warning. A non-loopback `MCP_HTTP_HOST` is ignored and the override is logged:

```bash
MCP_TRANSPORT=http MCP_ALLOW_INSECURE_DEV=1 npm run start:http
```

## Development

```bash
export NODE_AUTH_TOKEN=$(gh auth token)
npm ci
npm run build       # Build the project
npm run dev         # Watch mode
npm run test        # Run tests
npm run lint        # Type-check
npm run clean       # Remove dist/

# HTTP refuses to start until CONDUIT_S2S_SECRET is a real secret
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" npm run start:http

# Local HTTP only, without a service-to-service secret (always binds 127.0.0.1)
MCP_ALLOW_INSECURE_DEV=1 npm run start:http
```

## Testing

```bash
npm test            # Run test suite
npm run test:watch  # Watch mode
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Apache 2.0 — Copyright WYRE Technology
