# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `/health` liveness endpoint no longer gates its HTTP status on credentials.
  The Azure Container Apps liveness probe calls `GET /health` with no credentials,
  so the previous credential-gated `503` caused the container to crash-loop.
  The endpoint now always returns `200`; credential presence is still reported
  in the response body (`credentials.configured`).

### Added

- Initial Inforcer MCP server wrapping the community-sourced
  `@wyre-technology/node-inforcer` SDK.
- Decision-tree navigation (`inforcer_navigate`) and an `inforcer_status`
  connectivity check (live `baselines.list()`).
- Read-only governance tools across nine domains:
  - **tenants**: `inforcer_tenants_list`, `inforcer_tenants_get`, `inforcer_tenants_resolve`
  - **baselines**: `inforcer_baselines_list`
  - **alignment**: `inforcer_alignment_scores`, `inforcer_alignment_details`
  - **policies**: `inforcer_policies_list`
  - **secure-scores**: `inforcer_secure_scores_get`
  - **identity**: `inforcer_users_list`, `inforcer_users_get`, `inforcer_groups_list`, `inforcer_groups_get`, `inforcer_roles_list`
  - **audit**: `inforcer_audit_event_types`, `inforcer_audit_search`
  - **assessments**: `inforcer_assessments_list`
  - **reports**: `inforcer_reports_types_list`, `inforcer_reports_runs_list`,
    `inforcer_reports_run_status`, `inforcer_reports_download_output`
- Two HIGH-IMPACT (non-destructive) write actions — `inforcer_assessments_run` and
  `inforcer_reports_run` — both with elicitation-based confirmation. `inforcer_reports_run`
  brings the server to cmdlet parity with the community PowerShell module's report-generation
  surface (`Invoke-InforcerReport` / `Get-InforcerReportRun` / `Save-InforcerReportOutput`),
  backed by a new `reports` resource in `@wyre-technology/node-inforcer@1.1.0`.
- Flexible tenant resolution: `tenant` arguments accept a numeric Client Tenant ID,
  a tenant DNS name, an Azure AD GUID, or a friendly name (resolved via
  `resolveTenantId`).
- Dual transport (stdio + Streamable HTTP) with gateway credential injection via
  `x-inforcer-region` / `x-inforcer-api-key` headers and cache invalidation.
- Governance prompt templates: `alignment-review`, `tenant-drift-detail`,
  `identity-posture-check`.
- Docker image, MCP Registry metadata (`server.json`), and CI workflows.
