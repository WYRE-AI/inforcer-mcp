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

```bash
docker compose up
```

Or pull the pre-built image:

```bash
docker run -d \
  -e INFORCER_REGION=us \
  -e INFORCER_API_KEY=your-key \
  -p 8080:8080 \
  ghcr.io/wyre-ai/inforcer-mcp:latest
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

| Variable | Description | Default |
|----------|-------------|---------|
| `INFORCER_REGION` | **Required.** Inforcer API region — one of `anz`, `eu`, `uk`, `us`. There is no default; the server errors clearly if it is missing. | — |
| `INFORCER_API_KEY` | **Required.** Inforcer API key, sent as the `Inf-Api-Key` header. | — |
| `MCP_TRANSPORT` | Transport mode (`stdio` or `http`) | `stdio` |
| `MCP_HTTP_PORT` | HTTP server port | `8080` |
| `AUTH_MODE` | Auth mode (`env` or `gateway`) | `env` |
| `LOG_LEVEL` | Log level (`debug`, `info`, `warn`, `error`) | `info` |

Both `INFORCER_REGION` and `INFORCER_API_KEY` are required for any API call. Tool discovery (`tools/list`) works without them; the first real call will error if either is missing.

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

When hosted behind the WYRE MCP Gateway, set `AUTH_MODE=gateway` and `MCP_TRANSPORT=http`. In this mode the server is stateless (a fresh MCP server + transport per request) and reads credentials from per-request HTTP headers injected by the gateway:

| Header | Maps to |
|--------|---------|
| `x-inforcer-region` | `INFORCER_REGION` |
| `x-inforcer-api-key` | `INFORCER_API_KEY` |

When both headers are present the server updates the environment and invalidates its cached client so the next call uses the freshly-injected credentials. `tools/list` still works without credentials, so discovery is never blocked. The container image defaults to `MCP_TRANSPORT=http`; `/health` reports `ok` when credentials are configured and `degraded` otherwise.

## Docker Deployment

See [docker-compose.yml](docker-compose.yml) for full configuration. Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
# Edit .env with INFORCER_REGION and INFORCER_API_KEY
docker compose up -d
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
